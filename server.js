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
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEMO_PASSWORD = process.env.TSN_DEMO_PASSWORD || 'TSN-Demo!9vK2p-Q8rM';
const LAYERS = [
  {
    id: 1,
    name: 'Layer 1: Backstage',
    tagline: 'A private starter room for trusted TSN users.',
    password: process.env.TSN_LAYER_1_PASSWORD || 'TSN-Layer1!8qN4-vZ2m-R7tP'
  },
  {
    id: 2,
    name: 'Layer 2: Inner Circle',
    tagline: 'A deeper room that only opens after Layer 1.',
    password: process.env.TSN_LAYER_2_PASSWORD || 'TSN-Layer2!5xC9-mH6a-B3yL'
  },
  {
    id: 3,
    name: 'Layer 3: Core Vault',
    tagline: 'The deepest TSN room. Requires all previous layers.',
    password: process.env.TSN_LAYER_3_PASSWORD || 'TSN-Layer3!2pW7-kD8s-N4rX'
  }
];
const DEMO_USERS = [
  {
    name: 'Alex Demo',
    username: 'alex',
    email: 'alex@tsn.local',
    bio: 'Demo account for testing TSN chat.',
    post: 'Hey, I am Alex. Click me in People to test realtime chat.'
  },
  {
    name: 'Sam Demo',
    username: 'sam',
    email: 'sam@tsn.local',
    bio: 'Second demo account for testing conversations.',
    post: 'This is Sam. TSN demo chat is ready.'
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

if (process.env.NODE_ENV === 'production') {
  ['JWT_SECRET', 'TSN_DEMO_PASSWORD', 'TSN_LAYER_1_PASSWORD', 'TSN_LAYER_2_PASSWORD', 'TSN_LAYER_3_PASSWORD'].forEach((name) => {
    if (!process.env[name]) console.warn(`Security warning: ${name} is not set. Add it in your hosting environment before public launch.`);
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    bio: user.bio || '',
    createdAt: user.createdAt,
    unlockedLayers: Array.isArray(user.unlockedLayers) ? user.unlockedLayers : []
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
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
    ...post,
    author: publicUser(author),
    comments: (post.comments || []).map((comment) => ({
      ...comment,
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
    ...post,
    author: publicUser(author)
  };
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
  const taken = db.users.some((user) => user.username === username || (submittedEmail && user.email === submittedEmail));
  if (taken) return res.status(409).json({ error: 'Username or email is already used.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: id('usr'),
    name,
    username,
    email,
    bio: 'New on TSN.',
    passwordHash,
    unlockedLayers: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  await writeDb(db);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const login = normalizeEmail(req.body.login || req.body.email || req.body.username);
  const password = String(req.body.password || '');
  const db = readDb();

  const user = db.users.find((candidate) => candidate.email === login || candidate.username === login);
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
  } while (db.users.some((user) => user.username === username));

  const user = {
    id: id('usr'),
    name: `Guest ${username.slice(-4)}`,
    username,
    email: `${username}@tsn.local`,
    bio: 'Temporary guest account on TSN.',
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
  let user = db.users.find((candidate) => candidate.username === blueprint.username);

  if (!user) {
    user = {
      id: id('usr'),
      name: blueprint.name,
      username: blueprint.username,
      email: blueprint.email,
      bio: blueprint.bio,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      demoPasswordVersion: 2,
      unlockedLayers: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
  } else if (user.demoPasswordVersion !== 2) {
    user.passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    user.demoPasswordVersion = 2;
  }

  const hasDemoPost = db.posts.some((post) => post.authorId === user.id);
  if (!hasDemoPost) {
    db.posts.push({
      id: id('post'),
      authorId: user.id,
      body: blueprint.post,
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

  if (name) user.name = name;
  user.bio = bio;
  await writeDb(db);
  res.json({ user: publicUser(user) });
});

app.get('/api/users', requireAuth, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  const users = req.db.users
    .filter((user) => user.id !== req.user.id)
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.username.includes(q))
    .map((user) => ({ ...publicUser(user), online: onlineUsers.has(user.id) }))
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
    body,
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
    body,
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
  if (!password || !safeStringEqual(password, layer.password)) {
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
    body,
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
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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
        text,
        createdAt: new Date().toISOString()
      };

      db.messages.push(message);
      await writeDb(db);
      io.to(user.id).to(recipient.id).emit('private-message', message);
      if (typeof callback === 'function') callback({ ok: true, message });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TSN is running on port ${PORT}.`);
  console.log(`Database file: ${DB_FILE}`);
  console.log('Easy login is available: Continue as Guest or Demo Alex/Sam.');

  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.warn('WARNING: Set a strong JWT_SECRET before using TSN publicly.');
  }
});
