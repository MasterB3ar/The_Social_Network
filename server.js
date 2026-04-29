require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
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
const PROJECT_DATA_DIR = path.join(__dirname, 'data');
const LEGACY_DB_FILE = path.join(PROJECT_DATA_DIR, 'db.json');
const DEFAULT_LOCAL_DATA_DIR = path.join(os.homedir(), '.tsn-social-network');
const CONFIGURED_DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : '';
const DATA_DIR =
  process.env.NODE_ENV !== 'production' && CONFIGURED_DATA_DIR === path.resolve(PROJECT_DATA_DIR)
    ? DEFAULT_LOCAL_DATA_DIR
    : CONFIGURED_DATA_DIR || DEFAULT_LOCAL_DATA_DIR;
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const DB_BACKUP_DIR = process.env.TSN_BACKUP_DIR ? path.resolve(process.env.TSN_BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEMO_PASSWORD = process.env.TSN_DEMO_PASSWORD || 'TSN-Demo!9vK2p-Q8rM';
const DEMO_PASSWORD_HASH = process.env.TSN_DEMO_PASSWORD_HASH || '';
const ADMIN_SETUP_PASSWORD = process.env.TSN_ADMIN_SETUP_PASSWORD || 'TSN-Admin!ChangeMe-2026';
const ADMIN_SETUP_PASSWORD_HASH = process.env.TSN_ADMIN_SETUP_PASSWORD_HASH || '';
const ROOMS = [
  { id: 1, name: 'Room 1: Lobby', tagline: 'General chat for everyone on TSN.' },
  { id: 2, name: 'Room 2: Gaming', tagline: 'Talk about games, matches, and clips.' },
  { id: 3, name: 'Room 3: Tech', tagline: 'Code, PCs, apps, and hardware talk.' },
  { id: 4, name: 'Room 4: Creative', tagline: 'Share ideas, art, edits, and projects.' },
  { id: 5, name: 'Room 5: Study', tagline: 'Homework, planning, and focus chat.' },
  { id: 6, name: 'Room 6: Builds', tagline: 'Show off builds, setups, and progress.' },
  { id: 7, name: 'Room 7: Chill', tagline: 'Casual conversation and hangout space.' }
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

function emptyDatabase() {
  return { users: [], posts: [], messages: [], rooms: [], roomMessages: [] };
}

function databaseHasUserData(db) {
  return Boolean(
    db &&
      (
        (Array.isArray(db.users) && db.users.length) ||
        (Array.isArray(db.posts) && db.posts.length) ||
        (Array.isArray(db.messages) && db.messages.length) ||
        (Array.isArray(db.roomMessages) && db.roomMessages.length) ||
        (Array.isArray(db.rooms) && db.rooms.some((room) => room.ownerId || room.nameEnc || room.passwordHash))
      )
  );
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
}

function writeJsonFileSync(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureDatabase() {
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    let initialDb = emptyDatabase();

    // Older TSN versions stored data inside the project at ./data/db.json.
    // Copy that database once into the persistent data directory instead of starting over.
    if (path.resolve(LEGACY_DB_FILE) !== path.resolve(DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) {
      try {
        const legacyDb = readJsonFile(LEGACY_DB_FILE);
        if (databaseHasUserData(legacyDb)) {
          initialDb = legacyDb;
          console.log(`Imported existing legacy database from ${LEGACY_DB_FILE} into ${DB_FILE}.`);
        }
      } catch (error) {
        console.warn(`Could not import legacy database from ${LEGACY_DB_FILE}: ${error.message}`);
      }
    }

    writeJsonFileSync(DB_FILE, initialDb);
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
      rooms: Array.isArray(db.rooms) ? db.rooms : [],
      roomMessages: Array.isArray(db.roomMessages) ? db.roomMessages : []
    };
  } catch (error) {
    console.error('Database read failed:', error);
    return emptyDatabase();
  }
}

let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(async () => {
    const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpFile, JSON.stringify(db, null, 2));
    await fs.promises.rename(tmpFile, DB_FILE);
  });
  return writeQueue;
}

function storagePersistenceWarning() {
  const normalized = path.resolve(DATA_DIR);
  if (process.env.NODE_ENV !== 'production') return '';
  if (normalized.startsWith('/tmp')) return 'DATA_DIR is under /tmp, so hosted data can disappear after restarts or deploys.';
  if (normalized === path.resolve(PROJECT_DATA_DIR)) return 'DATA_DIR is inside the app source folder, so hosted data can be overwritten by updates.';
  return '';
}

function backupDatabase(reason = 'manual') {
  ensureDatabase();
  if (!fs.existsSync(DB_BACKUP_DIR)) fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(DB_BACKUP_DIR, `db-${stamp}-${reason}.json`);
  fs.copyFileSync(DB_FILE, backupFile);
  return backupFile;
}

function getStorageStatus() {
  ensureDatabase();
  fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(DB_FILE, fs.constants.R_OK | fs.constants.W_OK);
  return {
    ok: true,
    dataDir: DATA_DIR,
    dbFile: DB_FILE,
    backupDir: DB_BACKUP_DIR,
    persistenceWarning: storagePersistenceWarning()
  };
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const CONTENT_FILTER_ENABLED = String(process.env.TSN_CONTENT_FILTER_ENABLED || 'true').toLowerCase() !== 'false';
const DEFAULT_BLOCKED_WORDS = [
  'fuck', 'fucking', 'shit', 'bullshit', 'bitch', 'asshole', 'bastard', 'cunt',
  'dick', 'pussy', 'whore', 'slut', 'twat', 'wanker', 'motherfucker',
  'nigger', 'nigga', 'faggot', 'retard', 'kys', 'kill yourself'
];
const CUSTOM_BLOCKED_WORDS = String(process.env.TSN_BLOCKED_WORDS || '')
  .split(',')
  .map((word) => word.trim())
  .filter(Boolean);
const BLOCKED_WORDS = [...new Set([...DEFAULT_BLOCKED_WORDS, ...CUSTOM_BLOCKED_WORDS].map((word) => word.toLowerCase()))];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForContentFilter(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't');
}

function buildBlockedWordPattern(word) {
  const normalized = normalizeForContentFilter(word).trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  const pattern = parts
    .map((part) => part.split('').map(escapeRegExp).join('[\\W_]*'))
    .join('[\\W_]+');

  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i');
}

const BLOCKED_WORD_PATTERNS = BLOCKED_WORDS
  .map(buildBlockedWordPattern)
  .filter(Boolean);

function getContentFilterMatch(value) {
  if (!CONTENT_FILTER_ENABLED) return null;
  const normalized = normalizeForContentFilter(value);
  return BLOCKED_WORD_PATTERNS.find((pattern) => pattern.test(normalized)) || null;
}

function contentFilterError(value, fieldName = 'Text') {
  if (!getContentFilterMatch(value)) return null;
  return `${fieldName} contains blocked language.`;
}

function rejectBlockedContent(res, value, fieldName = 'Text') {
  const error = contentFilterError(value, fieldName);
  if (!error) return false;
  res.status(400).json({ error });
  return true;
}

function assertContentAllowed(value, fieldName = 'Text') {
  const error = contentFilterError(value, fieldName);
  if (error) {
    const blockedError = new Error(error);
    blockedError.statusCode = 400;
    throw blockedError;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return cleanText(username, 24).toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function validateAccountPassword(password) {
  if (password.length < 4) return 'Password must be at least 4 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
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

async function verifyAdminSetupPassword(password) {
  if (ADMIN_SETUP_PASSWORD_HASH) return bcrypt.compare(password, ADMIN_SETUP_PASSWORD_HASH);
  if (process.env.NODE_ENV === 'production' && !process.env.TSN_ADMIN_SETUP_PASSWORD) return false;
  return safeStringEqual(password, ADMIN_SETUP_PASSWORD);
}

if (process.env.NODE_ENV === 'production') {
  ['JWT_SECRET', 'TSN_DATA_ENCRYPTION_KEY'].forEach((name) => {
    if (!process.env[name]) console.warn(`Security warning: ${name} is not set. Add it in your hosting environment before public launch.`);
  });

  if (!process.env.TSN_DEMO_PASSWORD_HASH && !process.env.TSN_DEMO_PASSWORD) {
    console.warn('Security warning: set TSN_DEMO_PASSWORD_HASH or TSN_DEMO_PASSWORD before public launch.');
  }

  if (!process.env.TSN_ADMIN_SETUP_PASSWORD_HASH && !process.env.TSN_ADMIN_SETUP_PASSWORD) {
    console.warn('Security warning: set TSN_ADMIN_SETUP_PASSWORD_HASH before public launch so only you can claim admin rights.');
  }
  if (!process.env.TSN_ADMIN_SETUP_PASSWORD_HASH && process.env.TSN_ADMIN_SETUP_PASSWORD) {
    console.warn('Security note: TSN_ADMIN_SETUP_PASSWORD_HASH is better than TSN_ADMIN_SETUP_PASSWORD because the admin setup secret is stored as a bcrypt hash.');
  }

}

function isBanned(user) {
  return Boolean(user && user.bannedAt);
}

function getSessionVersion(user) {
  const version = Number(user && user.sessionVersion);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

function publicUser(user) {
  if (!user) return null;
  const role = user.role === 'admin' ? 'admin' : 'user';
  return {
    id: user.id,
    name: getUserField(user, 'name'),
    username: getUserField(user, 'username'),
    email: getUserField(user, 'email'),
    bio: getUserField(user, 'bio'),
    role,
    isAdmin: role === 'admin',
    banned: isBanned(user),
    bannedAt: user.bannedAt || null,
    createdAt: user.createdAt
  };
}

function publicModerationUser(user) {
  const safe = publicUser(user);
  if (!safe) return null;
  return {
    ...safe,
    online: onlineUsers.has(user.id),
    banReason: user.banReason || '',
    bannedBy: user.bannedBy || null,
    kickedAt: user.kickedAt || null,
    sessionVersion: getSessionVersion(user)
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, sv: getSessionVersion(user) }, JWT_SECRET, { expiresIn: '7d' });
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
  if (!user) return res.status(401).json({ error: 'Account not found.', logout: true });
  if (isBanned(user)) return res.status(403).json({ error: 'This account has been banned.', logout: true });
  if (Number(payload.sv) !== getSessionVersion(user)) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.', logout: true });
  }

  req.user = user;
  req.db = db;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin rights are required.' });
  }
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

function getRoom(roomId) {
  return ROOMS.find((room) => room.id === Number(roomId));
}

function getRoomRecord(db, roomId) {
  db.rooms = Array.isArray(db.rooms) ? db.rooms : [];
  const idNumber = Number(roomId);
  let record = db.rooms.find((room) => room.id === idNumber);
  if (!record) {
    record = {
      id: idNumber,
      ownerId: null,
      claimedAt: null,
      nameEnc: '',
      passwordHash: '',
      passwordVersion: 0
    };
    db.rooms.push(record);
  }
  if (record.passwordVersion === undefined) record.passwordVersion = 0;
  if (record.passwordHash === undefined) record.passwordHash = '';
  if (record.nameEnc === undefined) record.nameEnc = '';
  return record;
}

function getRoomDisplayName(room, record) {
  const customName = getEncryptedObjectField(record, 'name').trim();
  return customName || room.name;
}

function getRoomAccessVersion(user, roomId) {
  if (!user || !user.roomAccessVersions || typeof user.roomAccessVersions !== 'object') return -1;
  const version = Number(user.roomAccessVersions[String(roomId)]);
  return Number.isFinite(version) ? version : -1;
}

function userCanManageRoom(user, record) {
  return Boolean(user && (user.role === 'admin' || record.ownerId === user.id));
}

function userCanAccessRoom(user, record) {
  if (!record.passwordHash) return true;
  if (userCanManageRoom(user, record)) return true;
  return getRoomAccessVersion(user, record.id) === Number(record.passwordVersion || 0);
}

function clearRoomAccessForAllUsers(db, roomId) {
  db.users.forEach((user) => {
    if (user.roomAccessVersions && typeof user.roomAccessVersions === 'object') {
      delete user.roomAccessVersions[String(roomId)];
    }
  });
}

function publicRoom(room, db, currentUser) {
  const record = getRoomRecord(db, room.id);
  const owner = record.ownerId ? db.users.find((user) => user.id === record.ownerId) : null;
  const canManage = userCanManageRoom(currentUser, record);
  const hasPassword = Boolean(record.passwordHash);
  return {
    id: room.id,
    name: getRoomDisplayName(room, record),
    defaultName: room.name,
    tagline: room.tagline,
    ownerId: record.ownerId || null,
    owner: owner ? publicUser(owner) : null,
    claimed: Boolean(record.ownerId),
    claimedAt: record.claimedAt || null,
    hasPassword,
    canAccess: userCanAccessRoom(currentUser, record),
    canManage
  };
}

function emitRoomUpdated(db, room) {
  for (const socket of io.sockets.sockets.values()) {
    const viewer = db.users.find((candidate) => candidate.id === socket.user?.id);
    if (viewer && !isBanned(viewer)) {
      socket.emit('room-updated', publicRoom(room, db, viewer));
    }
  }
}

function emitRoomMessage(db, room, message) {
  for (const socket of io.sockets.sockets.values()) {
    const viewer = db.users.find((candidate) => candidate.id === socket.user?.id);
    const record = getRoomRecord(db, room.id);
    if (viewer && !isBanned(viewer) && userCanAccessRoom(viewer, record)) {
      socket.emit('room-message', message);
    }
  }
}

function attachRoomMessagePeople(message, users) {
  const author = users.find((user) => user.id === message.authorId);
  return {
    id: message.id,
    roomId: message.roomId,
    authorId: message.authorId,
    text: getEncryptedObjectField(message, 'text'),
    createdAt: message.createdAt,
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

    if (user.sessionVersion === undefined) {
      user.sessionVersion = 0;
      changed = true;
    }

    if (!user.roomAccessVersions || typeof user.roomAccessVersions !== 'object' || Array.isArray(user.roomAccessVersions)) {
      user.roomAccessVersions = {};
      changed = true;
    }

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

  if (!Array.isArray(db.rooms)) {
    db.rooms = [];
    changed = true;
  }

  if (!Array.isArray(db.roomMessages)) {
    db.roomMessages = [];
    changed = true;
  }

  db.roomMessages.forEach((message) => {
    if (migrateRecordField(message, 'text')) changed = true;
  });

  ROOMS.forEach((room) => {
    let record = db.rooms.find((candidate) => candidate.id === room.id);
    if (!record) {
      record = { id: room.id, ownerId: null, claimedAt: null, nameEnc: '', passwordHash: '', passwordVersion: 0 };
      db.rooms.push(record);
      changed = true;
    }

    if (record.name && migrateRecordField(record, 'name')) changed = true;
    if (record.nameEnc === undefined) {
      record.nameEnc = '';
      changed = true;
    }
    if (record.passwordHash === undefined) {
      record.passwordHash = '';
      changed = true;
    }
    if (record.passwordVersion === undefined) {
      record.passwordVersion = record.passwordHash ? 1 : 0;
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log('Migrated legacy plaintext database fields to encrypted fields.');
  }
}

app.post('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const backupFile = backupDatabase('admin');
    res.json({ ok: true, backupFile });
  } catch (error) {
    res.status(500).json({ error: `Backup failed: ${error.message}` });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const storage = getStorageStatus();
    res.json({
      ok: true,
      app: 'TSN V1.0',
      shortName: 'TSN V1.0',
      environment: process.env.NODE_ENV || 'development',
      storage: {
        ok: storage.ok,
        dataDir: storage.dataDir,
        dbFile: storage.dbFile,
        backupDir: storage.backupDir,
        persistenceWarning: storage.persistenceWarning
      },
      security: {
        accountPasswords: 'bcrypt-hashed',
        userIdentityFields: 'aes-256-gcm encrypted',
        posts: 'aes-256-gcm encrypted at rest',
        comments: 'aes-256-gcm encrypted at rest',
        privateMessages: 'aes-256-gcm encrypted at rest',
        roomMessages: 'aes-256-gcm encrypted at rest',
        usernameLookup: 'hmac-sha256',
        sessions: 'versioned JWT sessions support admin kick/logout',
        moderation: 'admins can delete content, kick accounts, ban accounts, and unban accounts',
        contentFilter: CONTENT_FILTER_ENABLED ? 'server-side blocked-language filter enabled' : 'disabled',
        customBlockedWords: CUSTOM_BLOCKED_WORDS.length,
        adminRights: 'claimable with server-side admin setup password'
      }
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      app: 'TSN V1.0',
      shortName: 'TSN V1.0',
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
  if (rejectBlockedContent(res, name, 'Display name')) return;
  if (rejectBlockedContent(res, username, 'Username')) return;

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
    sessionVersion: 0,
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
  if (isBanned(user)) return res.status(403).json({ error: 'This account has been banned.' });

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
    sessionVersion: 0,
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

  if (user && isBanned(user)) return res.status(403).json({ error: 'This demo account has been banned.' });

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
      sessionVersion: 0,
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

  if (name && rejectBlockedContent(res, name, 'Display name')) return;
  if (bio && rejectBlockedContent(res, bio, 'Bio')) return;

  if (name) setEncryptedUserField(user, 'name', name);
  setEncryptedUserField(user, 'bio', bio);
  await writeDb(db);
  res.json({ user: publicUser(user) });
});

app.post('/api/admin/claim', requireAuth, async (req, res) => {
  const password = String(req.body.password || '');
  const ok = password ? await verifyAdminSetupPassword(password) : false;
  if (!ok) return res.status(401).json({ error: 'Wrong admin setup password.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });

  user.role = 'admin';
  user.adminEnabledAt = new Date().toISOString();
  await writeDb(db);

  res.json({ user: publicUser(user) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = req.db.users
    .map(publicModerationUser)
    .sort((a, b) => Number(b.online) - Number(a.online) || Number(Boolean(b.banned)) - Number(Boolean(a.banned)) || a.name.localeCompare(b.name));

  res.json({ users });
});

app.post('/api/admin/users/:userId/kick', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot kick yourself.' });

  target.sessionVersion = getSessionVersion(target) + 1;
  target.kickedAt = new Date().toISOString();
  target.kickedBy = req.user.id;
  await writeDb(db);

  forceLogoutUser(target.id, 'You were kicked by an admin.');
  res.json({ ok: true, user: publicModerationUser(target) });
});

app.post('/api/admin/users/:userId/ban', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot ban yourself.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'You cannot ban another admin account.' });

  const reason = cleanText(req.body.reason, 200);
  if (reason && rejectBlockedContent(res, reason, 'Ban reason')) return;

  target.bannedAt = new Date().toISOString();
  target.bannedBy = req.user.id;
  target.banReason = reason;
  target.sessionVersion = getSessionVersion(target) + 1;
  await writeDb(db);

  forceLogoutUser(target.id, target.banReason ? `Your account was banned: ${target.banReason}` : 'Your account was banned by an admin.');
  res.json({ ok: true, user: publicModerationUser(target) });
});

app.post('/api/admin/users/:userId/unban', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  delete target.bannedAt;
  delete target.bannedBy;
  delete target.banReason;
  await writeDb(db);

  res.json({ ok: true, user: publicModerationUser(target) });
});

app.get('/api/users', requireAuth, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  const users = req.db.users
    .filter((user) => user.id !== req.user.id && !isBanned(user))
    .map((user) => ({ ...publicUser(user), online: onlineUsers.has(user.id) }))
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.username.toLowerCase().includes(q) || String(user.bio || '').toLowerCase().includes(q))
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
  if (rejectBlockedContent(res, body, 'Post')) return;

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

app.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  const db = req.db;
  const index = db.posts.findIndex((candidate) => candidate.id === req.params.postId);
  if (index < 0) return res.status(404).json({ error: 'Post not found.' });

  const post = db.posts[index];
  if (req.user.role !== 'admin' && post.authorId !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own posts.' });
  }

  const [deleted] = db.posts.splice(index, 1);
  await writeDb(db);
  io.emit('post-deleted', { postId: deleted.id });
  res.json({ ok: true, postId: deleted.id });
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
  if (rejectBlockedContent(res, body, 'Comment')) return;

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

app.delete('/api/posts/:postId/comments/:commentId', requireAuth, async (req, res) => {
  const db = req.db;
  const post = db.posts.find((candidate) => candidate.id === req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  post.comments = Array.isArray(post.comments) ? post.comments : [];
  const index = post.comments.findIndex((candidate) => candidate.id === req.params.commentId);
  if (index < 0) return res.status(404).json({ error: 'Comment not found.' });

  const comment = post.comments[index];
  if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }

  post.comments.splice(index, 1);
  await writeDb(db);

  const fullPost = attachPostPeople(post, db.users);
  io.emit('post-updated', fullPost);
  res.json({ ok: true, post: fullPost, commentId: req.params.commentId });
});

app.get('/api/rooms', requireAuth, (req, res) => {
  res.json({
    rooms: ROOMS.map((room) => publicRoom(room, req.db, req.user))
  });
});

app.post('/api/rooms/:roomId/claim', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const record = getRoomRecord(db, room.id);
  if (record.ownerId && record.ownerId !== req.user.id) {
    return res.status(409).json({ error: 'This room has already been claimed.' });
  }

  record.ownerId = req.user.id;
  record.claimedAt = record.claimedAt || new Date().toISOString();
  await writeDb(db);

  const safeRoom = publicRoom(room, db, req.user);
  emitRoomUpdated(db, room);
  res.json({ room: safeRoom, rooms: ROOMS.map((candidate) => publicRoom(candidate, db, req.user)) });
});

app.patch('/api/rooms/:roomId/settings', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const record = getRoomRecord(db, room.id);
  if (!record.ownerId) return res.status(400).json({ error: 'Claim this room before changing its name or password.' });
  if (!userCanManageRoom(req.user, record)) {
    return res.status(403).json({ error: 'Only the room owner or an admin can edit this room.' });
  }

  let changed = false;

  if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
    const name = cleanText(req.body.name, 40);
    if (name.length < 3) return res.status(400).json({ error: 'Room name must be at least 3 characters.' });
    if (rejectBlockedContent(res, name, 'Room name')) return;
    record.nameEnc = encryptField(name);
    changed = true;
  }

  if (req.body.clearPassword === true) {
    record.passwordHash = '';
    record.passwordVersion = Number(record.passwordVersion || 0) + 1;
    clearRoomAccessForAllUsers(db, room.id);
    changed = true;
  } else if (Object.prototype.hasOwnProperty.call(req.body, 'password')) {
    const password = String(req.body.password || '').trim();
    if (password) {
      if (password.length < 4) return res.status(400).json({ error: 'Room password must be at least 4 characters, or leave it empty for no password.' });
      if (password.length > 80) return res.status(400).json({ error: 'Room password must be 80 characters or fewer.' });
      record.passwordHash = await bcrypt.hash(password, 12);
      record.passwordVersion = Number(record.passwordVersion || 0) + 1;
      clearRoomAccessForAllUsers(db, room.id);
      changed = true;
    }
  }

  if (!changed) return res.status(400).json({ error: 'Nothing changed.' });

  await writeDb(db);
  const safeRoom = publicRoom(room, db, req.user);
  emitRoomUpdated(db, room);
  res.json({ room: safeRoom, rooms: ROOMS.map((candidate) => publicRoom(candidate, db, req.user)) });
});

app.post('/api/rooms/:roomId/unlock', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const record = getRoomRecord(db, room.id);
  if (!record.passwordHash) {
    return res.json({ room: publicRoom(room, db, req.user), unlocked: true });
  }
  if (userCanManageRoom(req.user, record)) {
    return res.json({ room: publicRoom(room, db, req.user), unlocked: true });
  }

  const password = String(req.body.password || '').trim();
  if (!password) return res.status(400).json({ error: 'Enter the room password.' });

  const ok = await bcrypt.compare(password, record.passwordHash);
  if (!ok) return res.status(403).json({ error: 'Wrong room password.' });

  const user = db.users.find((candidate) => candidate.id === req.user.id);
  user.roomAccessVersions = user.roomAccessVersions && typeof user.roomAccessVersions === 'object' ? user.roomAccessVersions : {};
  user.roomAccessVersions[String(room.id)] = Number(record.passwordVersion || 0);
  await writeDb(db);

  const safeRoom = publicRoom(room, db, user);
  emitRoomUpdated(db, room);
  res.json({ room: safeRoom, unlocked: true });
});

app.post('/api/rooms/:roomId/release', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const record = getRoomRecord(db, room.id);
  if (!record.ownerId) return res.status(400).json({ error: 'This room is not claimed.' });
  if (!userCanManageRoom(req.user, record)) {
    return res.status(403).json({ error: 'Only the room owner or an admin can release this room.' });
  }

  record.ownerId = null;
  record.claimedAt = null;
  record.nameEnc = '';
  record.passwordHash = '';
  record.passwordVersion = Number(record.passwordVersion || 0) + 1;
  clearRoomAccessForAllUsers(db, room.id);
  await writeDb(db);

  const safeRoom = publicRoom(room, db, req.user);
  emitRoomUpdated(db, room);
  res.json({ room: safeRoom, rooms: ROOMS.map((candidate) => publicRoom(candidate, db, req.user)) });
});

app.get('/api/rooms/:roomId/messages', requireAuth, (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const record = getRoomRecord(req.db, room.id);
  if (!userCanAccessRoom(req.user, record)) {
    return res.status(403).json({ error: 'This room is locked. Enter the room password first.', locked: true, room: publicRoom(room, req.db, req.user) });
  }

  const messages = [...req.db.roomMessages]
    .filter((message) => Number(message.roomId) === room.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => attachRoomMessagePeople(message, req.db.users));

  res.json({ room: publicRoom(room, req.db, req.user), messages });
});

app.post('/api/rooms/:roomId/messages', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const record = getRoomRecord(db, room.id);
  if (!userCanAccessRoom(req.user, record)) {
    return res.status(403).json({ error: 'This room is locked. Enter the room password first.', locked: true, room: publicRoom(room, db, req.user) });
  }

  const text = cleanText(req.body.text || req.body.body, 600);
  if (!text) return res.status(400).json({ error: 'Room message cannot be empty.' });
  if (rejectBlockedContent(res, text, 'Room message')) return;

  const message = {
    id: id('roommsg'),
    roomId: room.id,
    authorId: req.user.id,
    ...encryptedTextObject('text', text),
    createdAt: new Date().toISOString()
  };
  db.roomMessages.push(message);
  await writeDb(db);

  const safeMessage = attachRoomMessagePeople(message, db.users);
  emitRoomMessage(db, room, safeMessage);
  res.status(201).json({ message: safeMessage });
});

app.delete('/api/rooms/:roomId/messages/:messageId', requireAuth, async (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found.' });

  const db = req.db;
  const index = db.roomMessages.findIndex((candidate) => Number(candidate.roomId) === room.id && candidate.id === req.params.messageId);
  if (index < 0) return res.status(404).json({ error: 'Room message not found.' });

  const message = db.roomMessages[index];
  const record = getRoomRecord(db, room.id);
  const canDelete = req.user.role === 'admin' || message.authorId === req.user.id || record.ownerId === req.user.id;
  if (!canDelete) {
    return res.status(403).json({ error: 'You can only delete your own room messages unless you own the room or are an admin.' });
  }

  const [deleted] = db.roomMessages.splice(index, 1);
  await writeDb(db);
  io.emit('room-message-deleted', { roomId: room.id, messageId: deleted.id });
  res.json({ ok: true, roomId: room.id, messageId: deleted.id });
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

app.delete('/api/messages/:messageId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const index = db.messages.findIndex((candidate) => candidate.id === req.params.messageId);
  if (index < 0) return res.status(404).json({ error: 'Message not found.' });

  const [deleted] = db.messages.splice(index, 1);
  await writeDb(db);

  io.to(deleted.from).to(deleted.to).emit('message-deleted', { messageId: deleted.id, conversationId: deleted.conversationId });
  res.json({ ok: true, messageId: deleted.id, conversationId: deleted.conversationId });
});

const onlineUsers = new Map();

function forceLogoutUser(userId, reason) {
  onlineUsers.delete(userId);
  io.to(userId).emit('force-logout', { reason });
  io.in(userId).disconnectSockets(true);
  io.emit('presence', { userId, online: false });
}

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return next(new Error('Not authenticated'));

  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === payload.sub);
  if (!user) return next(new Error('User not found'));
  if (isBanned(user)) return next(new Error('Account banned'));
  if (Number(payload.sv) !== getSessionVersion(user)) {
    return next(new Error('Session expired'));
  }

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
      assertContentAllowed(text, 'Message');

      const db = readDb();
      const sender = db.users.find((candidate) => candidate.id === user.id);
      if (!sender || isBanned(sender)) throw new Error('Your account is not allowed to send messages.');
      const recipient = db.users.find((candidate) => candidate.id === to);
      if (!recipient || isBanned(recipient)) throw new Error('Recipient not found.');

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

try {
  ensureDatabase();
  const beforeMigrationDb = readDb();
  if (databaseHasUserData(beforeMigrationDb)) {
    const backupFile = backupDatabase('pre-start');
    console.log(`Database backup created before startup migration: ${backupFile}`);
  }
} catch (error) {
  console.warn(`Startup backup skipped: ${error.message}`);
}

migrateDatabaseAtRest();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TSN is running on port ${PORT}.`);
  console.log(`Database file: ${DB_FILE}`);
  console.log(`Backup directory: ${DB_BACKUP_DIR}`);
  const warning = storagePersistenceWarning();
  if (warning) console.warn(`Persistence warning: ${warning}`);
  console.log('Easy login is available: Continue as Guest or Demo User 1/2.');
  console.log('Admin rights can be claimed inside the app with TSN_ADMIN_SETUP_PASSWORD or TSN_ADMIN_SETUP_PASSWORD_HASH.');

  if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
    console.warn('WARNING: Set a strong JWT_SECRET before using TSN publicly.');
  }

  if (process.env.NODE_ENV === 'production' && DATA_ENCRYPTION_KEY === DEFAULT_DATA_ENCRYPTION_KEY) {
    console.warn('WARNING: Set TSN_DATA_ENCRYPTION_KEY before using TSN publicly.');
  }
});
