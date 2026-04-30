require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DEFAULT_JWT_SECRET = 'dev-secret-change-before-release';
const DEFAULT_DATA_ENCRYPTION_KEY = 'dev-data-encryption-key-change-before-release-32chars';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const DATA_ENCRYPTION_KEY = process.env.TSN_DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || DEFAULT_DATA_ENCRYPTION_KEY;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEMO_PASSWORD = process.env.TSN_DEMO_PASSWORD || 'TSN-Demo!9vK2p-Q8rM';
const DEMO_PASSWORD_HASH = process.env.TSN_DEMO_PASSWORD_HASH || '';
const LAYERS = [
  {
    id: 1,
    name: 'Layer 1: Backstage',
    tagline: 'A private starter room for trusted TSN users.',
    password: process.env.TSN_LAYER_1_PASSWORD || 'TSN-Layer1!8qN4-vZ2m-R7tP',
    passwordHash: process.env.TSN_LAYER_1_PASSWORD_HASH || ''
  },
  {
    id: 2,
    name: 'Layer 2: Inner Circle',
    tagline: 'A deeper room that only opens after Layer 1.',
    password: process.env.TSN_LAYER_2_PASSWORD || 'TSN-Layer2!5xC9-mH6a-B3yL',
    passwordHash: process.env.TSN_LAYER_2_PASSWORD_HASH || ''
  },
  {
    id: 3,
    name: 'Layer 3: Core Vault',
    tagline: 'The deepest TSN room. Requires all previous layers.',
    password: process.env.TSN_LAYER_3_PASSWORD || 'TSN-Layer3!2pW7-kD8s-N4rX',
    passwordHash: process.env.TSN_LAYER_3_PASSWORD_HASH || ''
  }
];
const DEMO_USERS = [
  {
    name: 'Demo User 1',
    username: 'demo_one',
    email: 'demo.one@tsn.local',
    bio: 'Generic demo account for testing TSN chat.',
    post: 'This is Demo User 1. Open People to test realtime chat.'
  },
  {
    name: 'Demo User 2',
    username: 'demo_two',
    email: 'demo.two@tsn.local',
    bio: 'Second generic demo account for testing conversations.',
    post: 'This is Demo User 2. TSN demo chat is ready.'
  }
];

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(express.static(PUBLIC_DIR));

function ensureDatabase() {
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], posts: [], messages: [], layerPosts: [] }, null, 2));
  }
}

function readDb() {
  ensureDatabase();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw || '{}');
    return {
      users: Array.isArray(db.users) ? db.users : [],
      posts: Array.isArray(db.posts) ? db.posts : [],
      messages: Array.isArray(db.messages) ? db.messages : [],
      layerPosts: Array.isArray(db.layerPosts) ? db.layerPosts : []
    };
  } catch (error) {
    console.error('Database read failed:', error);
    return { users: [], posts: [], messages: [], layerPosts: [] };
  }
}

let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(() => fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2)));
  return writeQueue;
}

function getStorageStatus() {
  ensureDatabase();
  fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(DB_FILE, fs.constants.R_OK | fs.constants.W_OK);
  return {
    ok: true,
    dataDir: DATA_DIR,
    dbFile: DB_FILE
  };
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return cleanText(username, 24).toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function validateAccountPassword(password) {
  if (password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a symbol.';
  return null;
}

function safeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const FIELD_ENCRYPTION_KEY = crypto.createHash('sha256').update(String(DATA_ENCRYPTION_KEY)).digest();
const LOOKUP_HMAC_KEY = crypto.createHash('sha256').update(`lookup:${DATA_ENCRYPTION_KEY}`).digest();

function encryptField(value) {
  const text = String(value ?? '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FIELD_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptField(value) {
  const text = String(value || '');
  if (!text.startsWith('v1:')) return text;

  try {
    const [, ivText, tagText, encryptedText] = text.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', FIELD_ENCRYPTION_KEY, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch (error) {
    console.error('Encrypted field could not be decrypted:', error.message);
    return '';
  }
}

function lookupHash(scope, normalizedValue) {
  const value = String(normalizedValue || '');
  if (!value) return '';
  return crypto.createHmac('sha256', LOOKUP_HMAC_KEY).update(`${scope}:${value}`).digest('hex');
}

function setEncryptedUserField(user, field, value) {
  user[`${field}Enc`] = encryptField(value);
  delete user[field];
}

function getUserField(user, field) {
  if (!user) return '';
  const encrypted = user[`${field}Enc`];
  if (encrypted) return decryptField(encrypted);
  return String(user[field] || '');
}

function encryptedTextObject(field, value) {
  return { [`${field}Enc`]: encryptField(value) };
}

function getEncryptedObjectField(object, field) {
  if (!object) return '';
  const encrypted = object[`${field}Enc`];
  if (encrypted) return decryptField(encrypted);
  return String(object[field] || '');
}

function encryptedUserIdentity({ name, username, email, bio }) {
  return {
    nameEnc: encryptField(name),
    usernameEnc: encryptField(username),
    emailEnc: encryptField(email),
    bioEnc: encryptField(bio || ''),
    usernameHash: lookupHash('username', normalizeUsername(username)),
    emailHash: lookupHash('email', normalizeEmail(email))
  };
}

function userMatchesUsername(user, username) {
  const normalized = normalizeUsername(username);
  return Boolean(normalized) && (
    user.usernameHash === lookupHash('username', normalized) ||
    normalizeUsername(getUserField(user, 'username')) === normalized
  );
}

function userMatchesEmail(user, email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized) && (
    user.emailHash === lookupHash('email', normalized) ||
    normalizeEmail(getUserField(user, 'email')) === normalized
  );
}

function findUserByLogin(users, loginValue) {
  const raw = String(loginValue || '');
  const email = normalizeEmail(raw);
  const username = normalizeUsername(raw);
  return users.find((candidate) => userMatchesEmail(candidate, email) || userMatchesUsername(candidate, username));
}

function secretFingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function demoPasswordHash() {
  if (DEMO_PASSWORD_HASH) return DEMO_PASSWORD_HASH;
  return bcrypt.hash(DEMO_PASSWORD, 12);
}

async function verifyLayerPassword(layer, password) {
  if (layer.passwordHash) return bcrypt.compare(password, layer.passwordHash);
  return safeStringEqual(password, layer.password);
}

if (process.env.NODE_ENV === 'production') {
  ['JWT_SECRET', 'TSN_DATA_ENCRYPTION_KEY'].forEach((name) => {
    if (!process.env[name]) console.warn(`Security warning: ${name} is not set. Add it in your hosting environment before public launch.`);
  });

  if (!process.env.TSN_DEMO_PASSWORD_HASH && !process.env.TSN_DEMO_PASSWORD) {
    console.warn('Security warning: set TSN_DEMO_PASSWORD_HASH or TSN_DEMO_PASSWORD before public launch.');
  }

  [1, 2, 3].forEach((layerId) => {
    const hashName = `TSN_LAYER_${layerId}_PASSWORD_HASH`;
    const plainName = `TSN_LAYER_${layerId}_PASSWORD`;
    if (!process.env[hashName] && !process.env[plainName]) {
      console.warn(`Security warning: set ${hashName} or ${plainName} before public launch.`);
    }
    if (!process.env[hashName] && process.env[plainName]) {
      console.warn(`Security note: ${hashName} is better than ${plainName} because the layer secret is stored as a bcrypt hash.`);
    }
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: getUserField(user, 'name'),
    username: getUserField(user, 'username'),
    email: getUserField(user, 'email'),
    bio: getUserField(user, 'bio'),
    createdAt: user.createdAt,
    unlockedLayers: Array.isArray(user.unlockedLayers) ? user.unlockedLayers : []
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'You must be logged in.' });

  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === payload.sub);
  if (!user) return res.status(401).json({ error: 'Account not found.' });

  req.user = user;
  req.db = db;
  next();
}

function attachPostPeople(post, users) {
  const author = users.find((user) => user.id === post.authorId);
  return {
    id: post.id,
    authorId: post.authorId,
    body: getEncryptedObjectField(post, 'body'),
    likes: Array.isArray(post.likes) ? post.likes : [],
    createdAt: post.createdAt,
    author: publicUser(author),
    comments: (post.comments || []).map((comment) => ({
      id: comment.id,
      authorId: comment.authorId,
      body: getEncryptedObjectField(comment, 'body'),
      createdAt: comment.createdAt,
      author: publicUser(users.find((user) => user.id === comment.authorId))
    }))
  };
}

function conversationId(a, b) {
  return [a, b].sort().join('__');
}

function getLayer(layerId) {
  return LAYERS.find((layer) => layer.id === Number(layerId));
}

function getUnlockedLayers(user) {
  return Array.isArray(user.unlockedLayers)
    ? user.unlockedLayers.filter((layerId) => getLayer(layerId))
    : [];
}

function hasUnlockedLayer(user, layerId) {
  return getUnlockedLayers(user).includes(Number(layerId));
}

function publicLayer(layer, user) {
  const unlocked = hasUnlockedLayer(user, layer.id);
  const previousUnlocked = layer.id === 1 || hasUnlockedLayer(user, layer.id - 1);
  return {
    id: layer.id,
    name: layer.name,
    tagline: layer.tagline,
    unlocked,
    available: previousUnlocked,
    requiresPrevious: layer.id > 1 && !previousUnlocked
  };
}

function attachLayerPostPeople(post, users) {
  const author = users.find((user) => user.id === post.authorId);
  return {
    id: post.id,
    layerId: post.layerId,
    authorId: post.authorId,
    body: getEncryptedObjectField(post, 'body'),
    createdAt: post.createdAt,
    author: publicUser(author)
  };
}

function publicMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    from: message.from,
    to: message.to,
    text: getEncryptedObjectField(message, 'text'),
    createdAt: message.createdAt
  };
}


function migrateRecordField(record, field) {
  if (!record || typeof record !== 'object') return false;
  const encryptedField = `${field}Enc`;
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(record, field)) {
    if (!record[encryptedField]) record[encryptedField] = encryptField(record[field]);
    delete record[field];
    changed = true;
  }

  return changed;
}

function migrateDatabaseAtRest() {
  const db = readDb();
  let changed = false;

  db.users.forEach((user) => {
    const plainUsername = user.username;
    const plainEmail = user.email;

    ['name', 'username', 'email', 'bio'].forEach((field) => {
      if (migrateRecordField(user, field)) changed = true;
    });

    if (!user.usernameHash) {
      const username = plainUsername || getUserField(user, 'username');
      if (username) {
        user.usernameHash = lookupHash('username', normalizeUsername(username));
        changed = true;
      }
    }

    if (!user.emailHash) {
      const email = plainEmail || getUserField(user, 'email');
      if (email) {
        user.emailHash = lookupHash('email', normalizeEmail(email));
        changed = true;
      }
    }
  });

  db.posts.forEach((post) => {
    if (migrateRecordField(post, 'body')) changed = true;
    (post.comments || []).forEach((comment) => {
      if (migrateRecordField(comment, 'body')) changed = true;
    });
  });

  db.messages.forEach((message) => {
    if (migrateRecordField(message, 'text')) changed = true;
  });

  db.layerPosts.forEach((post) => {
    if (migrateRecordField(post, 'body')) changed = true;
  });

  if (changed) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log('Migrated legacy plaintext database fields to encrypted fields.');
  }
}

app.get('/api/health', (req, res) => {
  try {
    const storage = getStorageStatus();
    res.json({
      ok: true,
      app: 'The Social Network',
      shortName: 'TSN',
      environment: process.env.NODE_ENV || 'development',
      storage: {
        ok: storage.ok,
        dataDir: storage.dataDir
      },
      security: {
        accountPasswords: 'bcrypt-hashed',
        userIdentityFields: 'aes-256-gcm encrypted',
        posts: 'aes-256-gcm encrypted at rest',
        comments: 'aes-256-gcm encrypted at rest',
        privateMessages: 'aes-256-gcm encrypted at rest',
        layerPosts: 'aes-256-gcm encrypted at rest',
        usernameLookup: 'hmac-sha256'
      }
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      app: 'The Social Network',
      shortName: 'TSN',
      error: 'Storage is not ready.',
      detail: error.message
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const name = cleanText(req.body.name, 60);
  const username = normalizeUsername(req.body.username);
  const submittedEmail = normalizeEmail(req.body.email);
  const email = submittedEmail || `${username}@tsn.local`;
  const password = String(req.body.password || '');

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required.' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  const passwordError = validateAccountPassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (submittedEmail && !/^\S+@\S+\.\S+$/.test(submittedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email, or leave it empty.' });
  }

  const db = readDb();
  const taken = db.users.some((user) => userMatchesUsername(user, username) || (submittedEmail && userMatchesEmail(user, submittedEmail)));
  if (taken) return res.status(409).json({ error: 'Username or email is already used.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: id('usr'),
    ...encryptedUserIdentity({
      name,
      username,
      email,
      bio: 'New on TSN.'
    }),
    passwordHash,
    unlockedLayers: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const login = req.body.login || req.body.email || req.body.username;
  const password = String(req.body.password || '');
  const db = readDb();

  const user = findUserByLogin(db.users, login);
  if (!user) return res.status(401).json({ error: 'Wrong login or password.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Wrong login or password.' });

  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/guest', async (req, res) => {
  const db = readDb();
  let username = '';
  do {
    username = `guest_${crypto.randomInt(1000, 9999)}`;
  } while (db.users.some((user) => userMatchesUsername(user, username)));

  const user = {
    id: id('usr'),
    ...encryptedUserIdentity({
      name: `Guest ${username.slice(-4)}`,
      username,
      email: `${username}@tsn.local`,
      bio: 'Temporary guest account on TSN.'
    }),
    passwordHash: await bcrypt.hash(crypto.randomUUID(), 12),
    unlockedLayers: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/demo', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const blueprint = DEMO_USERS.find((demo) => demo.username === username);
  if (!blueprint) return res.status(404).json({ error: 'Demo account not found.' });

  const db = readDb();
  let user = db.users.find((candidate) => userMatchesUsername(candidate, blueprint.username));
  const fingerprint = secretFingerprint(DEMO_PASSWORD_HASH || DEMO_PASSWORD);

  if (!user) {
    user = {
      id: id('usr'),
      ...encryptedUserIdentity({
        name: blueprint.name,
        username: blueprint.username,
        email: blueprint.email,
        bio: blueprint.bio
      }),
      passwordHash: await demoPasswordHash(),
      demoPasswordFingerprint: fingerprint,
      unlockedLayers: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
  } else if (user.demoPasswordFingerprint !== fingerprint) {
    user.passwordHash = await demoPasswordHash();
    user.demoPasswordFingerprint = fingerprint;
  }

  const hasDemoPost = db.posts.some((post) => post.authorId === user.id);
  if (!hasDemoPost) {
    db.posts.push({
      id: id('post'),
      authorId: user.id,
      ...encryptedTextObject('body', blueprint.post),
      likes: [],
      comments: [],
      createdAt: new Date().toISOString()
    });
  }

  await writeDb(db);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  const name = cleanText(req.body.name, 60);
  const bio = cleanText(req.body.bio, 160);

  if (name) setEncryptedUserField(user, 'name', name);
  setEncryptedUserField(user, 'bio', bio);
  await writeDb(db);
  res.json({ user: publicUser(user) });
});

app.get('/api/users', requireAuth, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  const users = req.db.users
    .filter((user) => user.id !== req.user.id)
    .map((user) => ({ ...publicUser(user), online: onlineUsers.has(user.id) }))
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.username.toLowerCase().includes(q))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  res.json({ users });
});

app.get('/api/posts', requireAuth, (req, res) => {
  const posts = [...req.db.posts]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((post) => attachPostPeople(post, req.db.users));
  res.json({ posts });
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const body = cleanText(req.body.body, 600);
  if (!body) return res.status(400).json({ error: 'Post cannot be empty.' });

  const db = req.db;
  const post = {
    id: id('post'),
    authorId: req.user.id,
    ...encryptedTextObject('body', body),
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.posts.push(post);
  await writeDb(db);

  const fullPost = attachPostPeople(post, db.users);
  io.emit('post-created', fullPost);
  res.status(201).json({ post: fullPost });
});

app.post('/api/posts/:postId/like', requireAuth, async (req, res) => {
  const db = req.db;
  const post = db.posts.find((candidate) => candidate.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  post.likes = Array.isArray(post.likes) ? post.likes : [];
  const existingIndex = post.likes.indexOf(req.user.id);
  if (existingIndex >= 0) post.likes.splice(existingIndex, 1);
  else post.likes.push(req.user.id);

  await writeDb(db);
  const fullPost = attachPostPeople(post, db.users);
  io.emit('post-updated', fullPost);
  res.json({ post: fullPost });
});

app.post('/api/posts/:postId/comments', requireAuth, async (req, res) => {
  const body = cleanText(req.body.body, 240);
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty.' });

  const db = req.db;
  const post = db.posts.find((candidate) => candidate.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const comment = {
    id: id('comment'),
    authorId: req.user.id,
    ...encryptedTextObject('body', body),
    createdAt: new Date().toISOString()
  };
  post.comments = Array.isArray(post.comments) ? post.comments : [];
  post.comments.push(comment);
  await writeDb(db);

  const fullPost = attachPostPeople(post, db.users);
  io.emit('post-updated', fullPost);
  res.status(201).json({ post: fullPost });
});

app.get('/api/layers', requireAuth, (req, res) => {
  res.json({
    layers: LAYERS.map((layer) => publicLayer(layer, req.user))
  });
});

app.post('/api/layers/:layerId/unlock', requireAuth, async (req, res) => {
  const layer = getLayer(req.params.layerId);
  if (!layer) return res.status(404).json({ error: 'Layer not found.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });

  if (layer.id > 1 && !hasUnlockedLayer(user, layer.id - 1)) {
    return res.status(403).json({ error: `Unlock Layer ${layer.id - 1} first.` });
  }

  const password = String(req.body.password || '');
  const passwordOk = password ? await verifyLayerPassword(layer, password) : false;
  if (!passwordOk) {
    return res.status(401).json({ error: `Wrong Layer ${layer.id} password.` });
  }

  user.unlockedLayers = getUnlockedLayers(user);
  if (!user.unlockedLayers.includes(layer.id)) user.unlockedLayers.push(layer.id);
  user.unlockedLayers.sort((a, b) => a - b);

  await writeDb(db);
  res.json({
    user: publicUser(user),
    layer: publicLayer(layer, user),
    layers: LAYERS.map((candidate) => publicLayer(candidate, user))
  });
});

app.get('/api/layers/:layerId/posts', requireAuth, (req, res) => {
  const layer = getLayer(req.params.layerId);
  if (!layer) return res.status(404).json({ error: 'Layer not found.' });
  if (!hasUnlockedLayer(req.user, layer.id)) return res.status(403).json({ error: 'Unlock this layer first.' });

  const posts = [...req.db.layerPosts]
    .filter((post) => post.layerId === layer.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((post) => attachLayerPostPeople(post, req.db.users));

  res.json({ layer: publicLayer(layer, req.user), posts });
});

app.post('/api/layers/:layerId/posts', requireAuth, async (req, res) => {
  const layer = getLayer(req.params.layerId);
  if (!layer) return res.status(404).json({ error: 'Layer not found.' });
  if (!hasUnlockedLayer(req.user, layer.id)) return res.status(403).json({ error: 'Unlock this layer first.' });

  const body = cleanText(req.body.body, 600);
  if (!body) return res.status(400).json({ error: 'Layer post cannot be empty.' });

  const db = req.db;
  const post = {
    id: id('layerpost'),
    layerId: layer.id,
    authorId: req.user.id,
    ...encryptedTextObject('body', body),
    createdAt: new Date().toISOString()
  };
  db.layerPosts.push(post);
  await writeDb(db);

  res.status(201).json({ post: attachLayerPostPeople(post, db.users) });
});

app.get('/api/messages/:userId', requireAuth, (req, res) => {
  const other = req.db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'User not found.' });

  const key = conversationId(req.user.id, other.id);
  const messages = req.db.messages
    .filter((message) => message.conversationId === key)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(publicMessage);

  res.json({ user: publicUser(other), messages });
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return next(new Error('Not authenticated'));

  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === payload.sub);
  if (!user) return next(new Error('User not found'));

  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.user;
  onlineUsers.set(user.id, socket.id);
  socket.join(user.id);
  io.emit('presence', { userId: user.id, online: true });

  socket.on('private-message', async (payload, callback) => {
    try {
      const to = String(payload.to || '');
      const text = cleanText(payload.text, 1000);
      if (!to || !text) throw new Error('Message needs a recipient and text.');

      const db = readDb();
      const recipient = db.users.find((candidate) => candidate.id === to);
      if (!recipient) throw new Error('Recipient not found.');

      const message = {
        id: id('msg'),
        conversationId: conversationId(user.id, recipient.id),
        from: user.id,
        to: recipient.id,
        ...encryptedTextObject('text', text),
        createdAt: new Date().toISOString()
      };
      const safeMessage = publicMessage(message);

      db.messages.push(message);
      await writeDb(db);
      io.to(user.id).to(recipient.id).emit('private-message', safeMessage);
      if (typeof callback === 'function') callback({ ok: true, message: safeMessage });
    } catch (error) {
      if (typeof callback === 'function') callback({ ok: false, error: error.message });
    }
  });

  socket.on('typing', (payload) => {
    const to = String(payload.to || '');
    if (to) socket.to(to).emit('typing', { from: user.id });
  });

  socket.on('disconnect', () => {
    const currentSocket = onlineUsers.get(user.id);
    if (currentSocket === socket.id) {
      onlineUsers.delete(user.id);
      io.emit('presence', { userId: user.id, online: false });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

migrateDatabaseAtRest();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TSN is running on port ${PORT}.`);
  console.log(`Database file: ${DB_FILE}`);
  console.log('Easy login is available: Continue as Guest or Demo User 1/2.');

  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.warn('WARNING: Set a strong JWT_SECRET before using TSN publicly.');
  }

  if (process.env.NODE_ENV === 'production' && DATA_ENCRYPTION_KEY === DEFAULT_DATA_ENCRYPTION_KEY) {
    console.warn('WARNING: Set TSN_DATA_ENCRYPTION_KEY before using TSN publicly.');
  }
});
