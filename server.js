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
const { MongoClient } = require('mongodb');
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
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const USE_MONGODB = Boolean(MONGODB_URI);
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'tsn';
const MONGODB_STATE_COLLECTION = process.env.MONGODB_STATE_COLLECTION || 'app_state';
const MONGODB_STATE_ID = process.env.MONGODB_STATE_ID || 'main';
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_SETUP_PASSWORD = process.env.TSN_ADMIN_SETUP_PASSWORD || 'TSN-Admin!ChangeMe-2026';
const ADMIN_SETUP_PASSWORD_HASH = process.env.TSN_ADMIN_SETUP_PASSWORD_HASH || '';
const PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS = 15 * 60 * 1000;
const ANTI_SPAM_ENABLED = String(process.env.TSN_ANTI_SPAM_ENABLED || 'true').toLowerCase() !== 'false';
const MESSAGE_COOLDOWN_MS = clampInteger(process.env.TSN_MESSAGE_COOLDOWN_MS || 1500, 250, 30000);
const DUPLICATE_MESSAGE_WINDOW_MS = clampInteger(process.env.TSN_DUPLICATE_MESSAGE_WINDOW_MS || 120000, 10000, 15 * 60 * 1000);
const MAX_DUPLICATE_MESSAGES_PER_WINDOW = clampInteger(process.env.TSN_MAX_DUPLICATES_PER_WINDOW || 3, 1, 20);
const SPAM_WINDOW_MS = clampInteger(process.env.TSN_SPAM_WINDOW_MS || 60000, 10000, 15 * 60 * 1000);
const MAX_MESSAGES_PER_SPAM_WINDOW = clampInteger(process.env.TSN_MAX_MESSAGES_PER_SPAM_WINDOW || 20, 5, 120);
const AUTO_MUTE_AFTER_WARNINGS = clampInteger(process.env.TSN_AUTO_MUTE_AFTER_WARNINGS || 5, 2, 50);
const AUTO_MUTE_MINUTES = clampInteger(process.env.TSN_AUTO_MUTE_MINUTES || 10, 1, 1440);
const DEFAULT_ADMIN_MUTE_MINUTES = clampInteger(process.env.TSN_DEFAULT_ADMIN_MUTE_MINUTES || 10, 1, 1440);
const DEFAULT_PROFILE_BADGE = 'Member';
const MAX_CUSTOM_BADGES_PER_USER = clampInteger(process.env.TSN_MAX_CUSTOM_BADGES_PER_USER || 6, 0, 20);
const ALLOWED_REACTIONS = new Set(['👍', '😂', '🔥', '💀', '❤️']);
const NOTIFICATION_LIMIT = clampInteger(process.env.TSN_NOTIFICATION_LIMIT || 3000, 100, 10000);
const WARNINGS_LIMIT = clampInteger(process.env.TSN_WARNINGS_LIMIT || 1000, 100, 10000);

const ACTIVITY_FEED_LIMIT = clampInteger(process.env.TSN_ACTIVITY_FEED_LIMIT || 150, 20, 1000);
const EVENTS_LIMIT = clampInteger(process.env.TSN_EVENTS_LIMIT || 80, 10, 300);
const POLLS_LIMIT = clampInteger(process.env.TSN_POLLS_LIMIT || 60, 10, 300);
const LEADERBOARD_LIMIT = clampInteger(process.env.TSN_LEADERBOARD_LIMIT || 20, 5, 100);
const XP_DAILY_LOGIN = clampInteger(process.env.TSN_XP_DAILY_LOGIN || 20, 0, 1000);
const XP_GLOBAL_MESSAGE = clampInteger(process.env.TSN_XP_GLOBAL_MESSAGE || 3, 0, 200);
const XP_PRIVATE_MESSAGE = clampInteger(process.env.TSN_XP_PRIVATE_MESSAGE || 2, 0, 200);
const XP_REACTION_RECEIVED = clampInteger(process.env.TSN_XP_REACTION_RECEIVED || 1, 0, 100);
const XP_FRIEND_ACCEPTED = clampInteger(process.env.TSN_XP_FRIEND_ACCEPTED || 10, 0, 1000);
const XP_EVENT_JOIN = clampInteger(process.env.TSN_XP_EVENT_JOIN || 8, 0, 1000);
const XP_POLL_VOTE = clampInteger(process.env.TSN_XP_POLL_VOTE || 4, 0, 1000);
const IMAGE_MAX_BYTES = clampInteger(process.env.TSN_IMAGE_MAX_BYTES || 2097152, 65536, 5242880);
const IMAGE_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const SAFE_MEDIA_LIBRARY = createSafeMediaLibrary();
const SAFE_MEDIA_BY_ID = new Map(SAFE_MEDIA_LIBRARY.map((item) => [item.id, item]));

const MEDIA_WEB_SEARCH_ENABLED = String(process.env.TSN_MEDIA_WEB_SEARCH_ENABLED || 'true').toLowerCase() !== 'false';
const MEDIA_WEB_PROVIDERS = String(process.env.TSN_MEDIA_WEB_PROVIDERS || 'giphy,pixabay')
  .split(',')
  .map((provider) => provider.trim().toLowerCase())
  .filter((provider) => ['giphy', 'pixabay'].includes(provider));
const MEDIA_WEB_SEARCH_LIMIT = clampInteger(process.env.TSN_MEDIA_WEB_SEARCH_LIMIT || 18, 4, 30);
const MEDIA_WEB_CACHE_TTL_MS = clampInteger(process.env.TSN_MEDIA_WEB_CACHE_TTL_MS || 15 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
const MEDIA_WEB_CACHE_LIMIT = clampInteger(process.env.TSN_MEDIA_WEB_CACHE_LIMIT || 400, 50, 2000);
const GIPHY_API_KEY = process.env.TSN_GIPHY_API_KEY || process.env.GIPHY_API_KEY || '';
const GIPHY_RATING = process.env.TSN_GIPHY_RATING || 'pg-13';
const GIPHY_LANG = process.env.TSN_GIPHY_LANG || 'da';
const PIXABAY_API_KEY = process.env.TSN_PIXABAY_API_KEY || process.env.PIXABAY_API_KEY || '';
const WEB_MEDIA_CACHE = new Map();


function splitEnvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCallIceServers() {
  const fallbackStunUrls = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302'
  ];

  const jsonConfig = String(process.env.TSN_ICE_SERVERS_JSON || '').trim();
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((server) => {
            if (!server || typeof server !== 'object') return null;
            const urls = Array.isArray(server.urls)
              ? server.urls.map(String).filter(Boolean)
              : String(server.urls || '').trim();
            if (!urls || (Array.isArray(urls) && urls.length === 0)) return null;
            const item = { urls };
            if (server.username) item.username = String(server.username);
            if (server.credential) item.credential = String(server.credential);
            return item;
          })
          .filter(Boolean);
        if (normalized.length) return normalized;
      }
    } catch (error) {
      console.warn(`TSN_ICE_SERVERS_JSON kunne ikke læses: ${error.message}`);
    }
  }

  const iceServers = [];
  const stunUrls = splitEnvList(process.env.TSN_STUN_URLS || fallbackStunUrls.join(','));
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  const turnUrls = splitEnvList(process.env.TSN_TURN_URLS || process.env.TURN_URLS || '');
  const turnUsername = process.env.TSN_TURN_USERNAME || process.env.TURN_USERNAME || '';
  const turnCredential = process.env.TSN_TURN_CREDENTIAL || process.env.TURN_CREDENTIAL || '';
  if (turnUrls.length && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  }

  return iceServers;
}

const CALL_ICE_SERVERS = buildCallIceServers();
const CALL_TURN_ENABLED = CALL_ICE_SERVERS.some((server) => {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => String(url || '').toLowerCase().startsWith('turn:') || String(url || '').toLowerCase().startsWith('turns:'));
});

const ROOMS = Array.from({ length: 7 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    name: `Room ${id}`,
    tagline: 'Claim this room to rename it and optionally set a password.'
  };
});
const app = express();
const pendingUsernameRegistrations = new Set();
const chatSpamMemory = new Map();
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  },
  maxHttpBufferSize: Math.max(IMAGE_MAX_BYTES * 2 + 1024 * 1024, 2 * 1024 * 1024)
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(morgan('dev'));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (/\.(html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

function emptyDatabase() {
  return { users: [], posts: [], messages: [], globalMessages: [], rooms: [], roomMessages: [], reports: [], notifications: [], warnings: [], activityFeed: [], events: [], polls: [], recoveryRequests: [], accountMerges: [], tsnStock: null };
}

function databaseHasUserData(db) {
  return Boolean(
    db &&
      (
        (Array.isArray(db.users) && db.users.length) ||
        (Array.isArray(db.posts) && db.posts.length) ||
        (Array.isArray(db.messages) && db.messages.length) ||
        (Array.isArray(db.globalMessages) && db.globalMessages.length) ||
        (Array.isArray(db.roomMessages) && db.roomMessages.length) ||
        (Array.isArray(db.reports) && db.reports.length) ||
        (Array.isArray(db.notifications) && db.notifications.length) ||
        (Array.isArray(db.warnings) && db.warnings.length) ||
        (Array.isArray(db.activityFeed) && db.activityFeed.length) ||
        (Array.isArray(db.events) && db.events.length) ||
        (Array.isArray(db.polls) && db.polls.length) ||
        (db.tsnStock && Array.isArray(db.tsnStock.history) && db.tsnStock.history.length) ||
        (Array.isArray(db.rooms) && db.rooms.some((room) => room.ownerId || room.nameEnc || room.passwordHash))
      )
  );
}

function normalizeDatabaseShape(db) {
  const normalized = {
    users: Array.isArray(db?.users) ? db.users : [],
    posts: Array.isArray(db?.posts) ? db.posts : [],
    messages: Array.isArray(db?.messages) ? db.messages : [],
    globalMessages: Array.isArray(db?.globalMessages) ? db.globalMessages : [],
    rooms: Array.isArray(db?.rooms) ? db.rooms : [],
    roomMessages: Array.isArray(db?.roomMessages) ? db.roomMessages : [],
    reports: Array.isArray(db?.reports) ? db.reports : [],
    notifications: Array.isArray(db?.notifications) ? db.notifications : [],
    warnings: Array.isArray(db?.warnings) ? db.warnings : [],
    activityFeed: Array.isArray(db?.activityFeed) ? db.activityFeed : [],
    events: Array.isArray(db?.events) ? db.events : [],
    polls: Array.isArray(db?.polls) ? db.polls : [],
    recoveryRequests: Array.isArray(db?.recoveryRequests) ? db.recoveryRequests : [],
    accountMerges: Array.isArray(db?.accountMerges) ? db.accountMerges : [],
    tsnStock: normalizeTsnStockState(db?.tsnStock)
  };
  ensureGrowthDatabaseShape(normalized);
  return normalized;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
}

function writeJsonFileSync(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}


function normalizeTsnStockState(stock) {
  const history = Array.isArray(stock?.history)
    ? stock.history
        .filter((point) => point && Number.isFinite(Number(point.price)) && point.createdAt)
        .slice(-240)
    : [];
  const lastPoint = history[history.length - 1] || null;
  const price = Number.isFinite(Number(stock?.price)) ? Number(stock.price) : Number(lastPoint?.price) || 100;
  return {
    price: Number(price.toFixed(2)),
    previousPrice: Number.isFinite(Number(stock?.previousPrice)) ? Number(stock.previousPrice) : Number((price * 0.995).toFixed(2)),
    updatedAt: stock?.updatedAt || lastPoint?.createdAt || new Date().toISOString(),
    history
  };
}

function expectedActivityForHour(hour) {
  const onlineCurve = [0.20, 0.14, 0.10, 0.08, 0.07, 0.08, 0.13, 0.22, 0.34, 0.42, 0.48, 0.52, 0.56, 0.58, 0.60, 0.66, 0.78, 0.92, 1.00, 0.96, 0.86, 0.68, 0.46, 0.30];
  const messageCurve = [0.16, 0.11, 0.08, 0.06, 0.05, 0.07, 0.12, 0.21, 0.32, 0.40, 0.48, 0.54, 0.58, 0.62, 0.66, 0.74, 0.84, 0.98, 1.00, 0.94, 0.82, 0.63, 0.42, 0.25];
  const postCurve = [0.12, 0.08, 0.06, 0.05, 0.05, 0.06, 0.10, 0.18, 0.30, 0.38, 0.46, 0.52, 0.56, 0.60, 0.63, 0.70, 0.80, 0.92, 1.00, 0.96, 0.84, 0.62, 0.38, 0.20];
  const index = Math.max(0, Math.min(23, Number(hour) || 0));
  return {
    online: onlineCurve[index],
    messages: messageCurve[index],
    posts: postCurve[index]
  };
}

function countSince(items, sinceMs, predicate = null) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const createdAt = new Date(item?.createdAt || 0).getTime();
    if (!Number.isFinite(createdAt) || createdAt < sinceMs) return false;
    return predicate ? predicate(item) : true;
  }).length;
}

function getTsnStockSnapshot(db, { persist = false, reason = 'view' } = {}) {
  const now = new Date();
  const nowMs = now.getTime();
  const hourAgoMs = nowMs - 60 * 60 * 1000;
  db.tsnStock = normalizeTsnStockState(db.tsnStock);

  const usersTotal = Math.max(1, (Array.isArray(db.users) ? db.users : []).filter((user) => !isBanned(user)).length);
  const onlineCount = onlineUsers.size;
  const privateMessagesPerHour = countSince(db.messages, hourAgoMs);
  const globalChatMessagesPerHour = countSince(db.globalMessages, hourAgoMs);
  const globalCommentsPerHour = (Array.isArray(db.globalMessages) ? db.globalMessages : []).reduce((total, message) => {
    return total + countSince(message.comments || [], hourAgoMs);
  }, 0);
  const messagesPerHour = privateMessagesPerHour + globalChatMessagesPerHour + globalCommentsPerHour;
  const postsPerHour = 0;
  const expected = expectedActivityForHour(now.getHours());

  const expectedOnline = Math.max(1, usersTotal * expected.online);
  const expectedMessages = Math.max(1, usersTotal * 3.2 * expected.messages);
  const expectedPosts = Math.max(1, usersTotal * 0.9 * expected.posts);
  const onlineRatio = onlineCount / expectedOnline;
  const messageRatio = messagesPerHour / expectedMessages;
  const postRatio = postsPerHour / expectedPosts;
  const activityScore = Math.max(0, Math.min(3.5, onlineRatio * 0.45 + messageRatio * 0.55));

  const previousPrice = Number(db.tsnStock.price) || 100;
  const targetPrice = 100 * (0.68 + activityScore * 0.62);
  const timePressure = (expected.online + expected.messages + expected.posts) / 3;
  const momentum = Math.max(-3.5, Math.min(5.5, (messagesPerHour * 0.10 + onlineCount * 0.45) * (0.55 + timePressure) - 1.2));
  const rawPrice = previousPrice + (targetPrice - previousPrice) * 0.22 + momentum;
  const price = Number(Math.max(1, Math.min(9999, rawPrice)).toFixed(2));
  const change = Number((price - previousPrice).toFixed(2));
  const changePercent = Number((previousPrice ? (change / previousPrice) * 100 : 0).toFixed(2));
  const trend = change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat';
  const generatedAt = now.toISOString();

  const snapshot = {
    symbol: 'TSN',
    name: 'TSN Stock',
    disclaimer: 'Fiktiv TSN-chataktivitetspris. Ikke en rigtig aktie og ikke finansiel rådgivning.',
    price,
    previousPrice,
    change,
    changePercent,
    trend,
    reason,
    metrics: {
      onlineUsers: onlineCount,
      usersTotal,
      messagesPerHour,
      privateMessagesPerHour,
      globalChatMessagesPerHour,
      globalCommentsPerHour,
      postsPerHour,
      hour: now.getHours(),
      expectedOnline: Number(expectedOnline.toFixed(2)),
      expectedMessagesPerHour: Number(expectedMessages.toFixed(2)),
      expectedPostsPerHour: Number(expectedPosts.toFixed(2)),
      activityScore: Number(activityScore.toFixed(3))
    },
    weights: {
      onlineUsers: 45,
      messagesPerHour: 55,
      postsPerHour: 0
    },
    history: [...db.tsnStock.history, { price, createdAt: generatedAt }].slice(-120),
    updatedAt: generatedAt
  };

  if (persist) {
    const lastPoint = db.tsnStock.history[db.tsnStock.history.length - 1];
    const shouldAppend = !lastPoint || nowMs - new Date(lastPoint.createdAt || 0).getTime() >= 20 * 1000 || Math.abs(Number(lastPoint.price) - price) >= 0.05;
    db.tsnStock.previousPrice = previousPrice;
    db.tsnStock.price = price;
    db.tsnStock.updatedAt = generatedAt;
    if (shouldAppend) db.tsnStock.history.push({ price, createdAt: generatedAt });
    db.tsnStock.history = db.tsnStock.history.slice(-120);
    snapshot.history = [...db.tsnStock.history];
  }

  return snapshot;
}

async function broadcastTsnStock(db, reason = 'activity') {
  const snapshot = getTsnStockSnapshot(db, { persist: true, reason });
  await writeDb(db);
  io.emit('tsn-stock-updated', snapshot);
  return snapshot;
}

function tryReadExistingFileDatabase() {
  const candidates = [DB_FILE, LEGACY_DB_FILE];
  for (const filePath of candidates) {
    try {
      if (!filePath || !fs.existsSync(filePath)) continue;
      const candidate = normalizeDatabaseShape(readJsonFile(filePath));
      if (databaseHasUserData(candidate)) {
        console.log(`Imported existing file database from ${filePath}.`);
        return candidate;
      }
    } catch (error) {
      console.warn(`Could not read existing database from ${filePath}: ${error.message}`);
    }
  }
  return emptyDatabase();
}

function ensureDatabase() {
  if (USE_MONGODB) return;

  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    let initialDb = emptyDatabase();

    if (path.resolve(LEGACY_DB_FILE) !== path.resolve(DB_FILE) && fs.existsSync(LEGACY_DB_FILE)) {
      try {
        const legacyDb = normalizeDatabaseShape(readJsonFile(LEGACY_DB_FILE));
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

let mongoClient = null;
let mongoCollection = null;
let cachedDb = null;
let writeQueue = Promise.resolve();

async function initDatabaseStorage() {
  if (!USE_MONGODB) {
    ensureDatabase();
    cachedDb = readDb();
    return;
  }

  mongoClient = new MongoClient(MONGODB_URI, {
    appName: 'TSN-V1.2',
    serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000)
  });

  await mongoClient.connect();
  mongoCollection = mongoClient.db(MONGODB_DB_NAME).collection(MONGODB_STATE_COLLECTION);

  const existing = await mongoCollection.findOne({ _id: MONGODB_STATE_ID });
  if (existing) {
    cachedDb = normalizeDatabaseShape(existing);
    console.log(`Connected to MongoDB database "${MONGODB_DB_NAME}" collection "${MONGODB_STATE_COLLECTION}".`);
    return;
  }

  cachedDb = tryReadExistingFileDatabase();
  await mongoCollection.updateOne(
    { _id: MONGODB_STATE_ID },
    { $set: { ...cachedDb, createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true }
  );
  console.log(`Created TSN MongoDB state document "${MONGODB_STATE_ID}".`);
}

function readDb() {
  if (USE_MONGODB) {
    if (!cachedDb) throw new Error('MongoDB storage has not finished starting.');
    return normalizeDatabaseShape(cachedDb);
  }

  ensureDatabase();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return normalizeDatabaseShape(JSON.parse(raw || '{}'));
  } catch (error) {
    console.error('Database read failed:', error);
    return emptyDatabase();
  }
}

function writeDb(db) {
  const normalizedDb = normalizeDatabaseShape(db);
  cachedDb = normalizedDb;

  writeQueue = writeQueue.catch((error) => {
    console.error('Previous database write failed:', error);
  }).then(async () => {
    if (USE_MONGODB) {
      if (!mongoCollection) throw new Error('MongoDB is not connected.');
      await mongoCollection.updateOne(
        { _id: MONGODB_STATE_ID },
        { $set: { ...normalizedDb, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    }

    const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpFile, JSON.stringify(normalizedDb, null, 2));
    await fs.promises.rename(tmpFile, DB_FILE);
  });
  return writeQueue;
}

function storagePersistenceWarning() {
  if (USE_MONGODB) return '';
  const normalized = path.resolve(DATA_DIR);
  if (process.env.NODE_ENV !== 'production') return '';
  if (normalized.startsWith('/tmp')) return 'DATA_DIR is under /tmp, so hosted data can disappear after restarts or deploys.';
  if (normalized === path.resolve(PROJECT_DATA_DIR)) return 'DATA_DIR is inside the app source folder, so hosted data can be overwritten by updates.';
  return '';
}

function backupDatabase(reason = 'manual') {
  if (!fs.existsSync(DB_BACKUP_DIR)) fs.mkdirSync(DB_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(DB_BACKUP_DIR, `db-${stamp}-${reason}.json`);
  const snapshot = readDb();
  fs.writeFileSync(backupFile, JSON.stringify(snapshot, null, 2));
  return backupFile;
}

function getStorageStatus() {
  if (USE_MONGODB) {
    if (!mongoCollection || !cachedDb) throw new Error('MongoDB is not ready.');
    return {
      ok: true,
      mode: 'mongodb',
      mongoDatabase: MONGODB_DB_NAME,
      mongoCollection: MONGODB_STATE_COLLECTION,
      mongoStateId: MONGODB_STATE_ID,
      backupDir: DB_BACKUP_DIR,
      persistenceWarning: ''
    };
  }

  ensureDatabase();
  fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(DB_FILE, fs.constants.R_OK | fs.constants.W_OK);
  return {
    ok: true,
    mode: 'json-file',
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

function clampInteger(value, min, max) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function emitUserProfileUpdated(user) {
  if (!user) return;
  io.emit('user-profile-updated', publicUser(user));
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
  return `${fieldName} indeholder blokeret sprog.`;
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

function normalizeUsername(username) {
  return cleanText(username, 24).toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function validateAccountPassword(password) {
  if (password.length < 4) return 'Adgangskoden skal være mindst 4 tegn.';
  if (password.length > 128) return 'Adgangskoden må højst være 128 tegn.';
  return null;
}

function safeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const DATA_KEY_CANDIDATES = [...new Set([
  DATA_ENCRYPTION_KEY,
  ...String(process.env.TSN_OLD_DATA_ENCRYPTION_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
  process.env.JWT_SECRET || '',
  DEFAULT_JWT_SECRET,
  DEFAULT_DATA_ENCRYPTION_KEY
].filter(Boolean))];

const CRYPTO_KEY_CANDIDATES = DATA_KEY_CANDIDATES.map((value) => ({
  value,
  fieldKey: crypto.createHash('sha256').update(String(value)).digest(),
  lookupKey: crypto.createHash('sha256').update(`lookup:${value}`).digest()
}));

const FIELD_ENCRYPTION_KEY = CRYPTO_KEY_CANDIDATES[0].fieldKey;
const LOOKUP_HMAC_KEY = CRYPTO_KEY_CANDIDATES[0].lookupKey;

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

  const [, ivText, tagText, encryptedText] = text.split(':');
  for (const keySet of CRYPTO_KEY_CANDIDATES) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', keySet.fieldKey, Buffer.from(ivText, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    } catch {
      // Try the next configured/legacy encryption key.
    }
  }

  console.error('Encrypted field could not be decrypted. Check TSN_DATA_ENCRYPTION_KEY or TSN_OLD_DATA_ENCRYPTION_KEYS.');
  return '';
}

function lookupHashWithKey(scope, normalizedValue, lookupKey) {
  const value = String(normalizedValue || '');
  if (!value) return '';
  return crypto.createHmac('sha256', lookupKey).update(`${scope}:${value}`).digest('hex');
}

function lookupHashes(scope, normalizedValue) {
  const value = String(normalizedValue || '');
  if (!value) return [];
  return CRYPTO_KEY_CANDIDATES.map((keySet) => lookupHashWithKey(scope, value, keySet.lookupKey));
}

function svgDataUrl({ title, subtitle, emoji, bg1, bg2, accent, animated = false }) {
  const safeTitle = String(title || '').slice(0, 28).replace(/[&<>"']/g, '');
  const safeSubtitle = String(subtitle || '').slice(0, 42).replace(/[&<>"']/g, '');
  const safeEmoji = String(emoji || '✨').slice(0, 4).replace(/[&<>"']/g, '');
  const pulse = animated
    ? '<animate attributeName="r" values="54;70;54" dur="1.25s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.20;0.42;0.20" dur="1.25s" repeatCount="indefinite"/>'
    : '';
  const float = animated
    ? '<animateTransform attributeName="transform" attributeType="XML" type="translate" values="0 0;0 -8;0 0" dur="1.4s" repeatCount="indefinite"/>'
    : '';
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${safeTitle}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/></filter>
    </defs>
    <rect width="640" height="420" rx="46" fill="url(#g)"/>
    <circle cx="525" cy="76" r="54" fill="${accent}" opacity="0.23">${pulse}</circle>
    <circle cx="106" cy="338" r="82" fill="#ffffff" opacity="0.10"/>
    <g filter="url(#shadow)" ${animated ? '' : ''}>
      <g>${float}<text x="320" y="180" font-size="108" text-anchor="middle" dominant-baseline="middle">${safeEmoji}</text></g>
      <rect x="90" y="238" width="460" height="96" rx="28" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.24)"/>
      <text x="320" y="282" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" text-anchor="middle">${safeTitle}</text>
      <text x="320" y="315" fill="rgba(255,255,255,0.78)" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${safeSubtitle}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createSafeMediaLibrary() {
  // TSN no longer ships a built-in safe media pack.
  // Users can only send media returned from approved website providers.
  return [];
}


function publicSafeMediaItem(item) {
  return {
    id: item.id,
    type: item.type,
    kind: item.kind,
    name: item.name,
    label: item.label,
    mimeType: item.mimeType,
    source: item.source,
    provider: item.provider || '',
    providerUrl: item.providerUrl || '',
    attribution: item.attribution || '',
    dataUrl: item.dataUrl || item.url || item.thumbnailUrl || '',
    url: item.url || item.dataUrl || '',
    thumbnailUrl: item.thumbnailUrl || item.dataUrl || item.url || ''
  };
}

function safeSearchQuery(value) {
  return cleanText(value || '', 80).replace(/[^\p{L}\p{N}\s_.#@+-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function webMediaCacheSet(item) {
  if (!item || !item.id || !item.url) return null;
  const cached = {
    ...item,
    type: 'image',
    cachedAt: Date.now(),
    expiresAt: Date.now() + MEDIA_WEB_CACHE_TTL_MS
  };
  WEB_MEDIA_CACHE.set(cached.id, cached);
  while (WEB_MEDIA_CACHE.size > MEDIA_WEB_CACHE_LIMIT) {
    const firstKey = WEB_MEDIA_CACHE.keys().next().value;
    if (!firstKey) break;
    WEB_MEDIA_CACHE.delete(firstKey);
  }
  return cached;
}

function webMediaCacheGet(idValue) {
  const id = cleanText(idValue || '', 180);
  const item = WEB_MEDIA_CACHE.get(id);
  if (!item) return null;
  if (Date.now() > Number(item.expiresAt || 0)) {
    WEB_MEDIA_CACHE.delete(id);
    return null;
  }
  return item;
}

function normalizeMediaUrl(value) {
  const url = String(value || '').trim();
  if (!/^https:\/\//i.test(url)) return '';
  return url.slice(0, 1200);
}

function mapGiphyResult(result) {
  const images = result?.images || {};
  const full = images.fixed_height || images.original || images.downsized || images.preview_gif;
  const preview = images.fixed_width_small || images.fixed_height_small || images.preview_gif || full;
  const url = normalizeMediaUrl(full?.url || preview?.url);
  const thumbnailUrl = normalizeMediaUrl(preview?.url || url);
  if (!result?.id || !url) return null;
  const title = cleanText(result.title || result.slug || 'GIPHY GIF', 80) || 'GIPHY GIF';
  return {
    id: `giphy:${result.id}`,
    type: 'image',
    kind: 'gif',
    name: title,
    label: title,
    mimeType: 'image/gif',
    source: 'giphy-web-search',
    provider: 'GIPHY',
    providerUrl: normalizeMediaUrl(result.url || ''),
    attribution: 'GIF fra GIPHY',
    url,
    thumbnailUrl,
    dataUrl: thumbnailUrl || url
  };
}

function mapPixabayResult(hit) {
  const url = normalizeMediaUrl(hit?.webformatURL || hit?.largeImageURL || hit?.previewURL);
  const thumbnailUrl = normalizeMediaUrl(hit?.previewURL || hit?.webformatURL || url);
  if (!hit?.id || !url) return null;
  const label = cleanText(String(hit.tags || 'Pixabay photo').split(',').slice(0, 2).join(', '), 80) || 'Pixabay photo';
  return {
    id: `pixabay:${hit.id}`,
    type: 'image',
    kind: 'picture',
    name: label,
    label,
    mimeType: 'image/jpeg',
    source: 'pixabay-web-search',
    provider: 'Pixabay',
    providerUrl: normalizeMediaUrl(hit.pageURL || ''),
    attribution: 'Foto fra Pixabay',
    url,
    thumbnailUrl,
    dataUrl: thumbnailUrl || url
  };
}

async function searchGiphyMedia(query, limit) {
  if (!GIPHY_API_KEY) return [];
  const params = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: String(limit),
    rating: GIPHY_RATING,
    lang: GIPHY_LANG
  });
  const endpoint = query ? 'search' : 'trending';
  if (query) params.set('q', query);
  const response = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`GIPHY svarede ${response.status}.`);
  const data = await response.json();
  return (Array.isArray(data.data) ? data.data : [])
    .map(mapGiphyResult)
    .filter(Boolean)
    .map(webMediaCacheSet)
    .filter(Boolean)
    .slice(0, limit);
}

async function searchPixabayMedia(query, limit) {
  if (!PIXABAY_API_KEY || !query) return [];
  const params = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: query,
    image_type: 'photo',
    safesearch: 'true',
    per_page: String(limit),
    lang: 'da'
  });
  const response = await fetch(`https://pixabay.com/api/?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Pixabay svarede ${response.status}.`);
  const data = await response.json();
  return (Array.isArray(data.hits) ? data.hits : [])
    .map(mapPixabayResult)
    .filter(Boolean)
    .map(webMediaCacheSet)
    .filter(Boolean)
    .slice(0, limit);
}

async function searchWebMedia({ query, kind, limit }) {
  if (!MEDIA_WEB_SEARCH_ENABLED) return { items: [], providers: [], warnings: ['Webmediesøgning er slået fra.'] };
  const normalizedQuery = safeSearchQuery(query);
  const requestedKind = ['gif', 'picture', 'all'].includes(kind) ? kind : 'all';
  const requestedLimit = clampInteger(limit || MEDIA_WEB_SEARCH_LIMIT, 4, MEDIA_WEB_SEARCH_LIMIT);
  const searches = [];
  const providers = [];
  const warnings = [];

  if ((requestedKind === 'gif' || requestedKind === 'all') && MEDIA_WEB_PROVIDERS.includes('giphy')) {
    if (GIPHY_API_KEY) {
      providers.push('giphy');
      searches.push(searchGiphyMedia(normalizedQuery, requestedLimit).catch((error) => {
        warnings.push(error.message);
        return [];
      }));
    } else {
      warnings.push('TSN_GIPHY_API_KEY mangler, så GIPHY GIFs er ikke aktive.');
    }
  }

  if ((requestedKind === 'picture' || requestedKind === 'all') && MEDIA_WEB_PROVIDERS.includes('pixabay')) {
    if (PIXABAY_API_KEY) {
      providers.push('pixabay');
      searches.push(searchPixabayMedia(normalizedQuery, requestedLimit).catch((error) => {
        warnings.push(error.message);
        return [];
      }));
    } else if (requestedKind === 'picture') {
      warnings.push('TSN_PIXABAY_API_KEY mangler, så fotosøgning er ikke aktiv.');
    }
  }

  const results = (await Promise.all(searches)).flat();
  const seen = new Set();
  const items = results.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, requestedLimit);

  return { items, providers, warnings, query: normalizedQuery, kind: requestedKind };
}

function lookupHash(scope, normalizedValue) {
  return lookupHashes(scope, normalizedValue)[0] || '';
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

function normalizeImageAttachment(input) {
  if (!input) return null;
  const libraryId = cleanText(input.libraryId || input.id || input.safeMediaId || input.webMediaId || '', 180);
  if (!libraryId) {
    if (input.dataUrl || input.url || input.base64 || input.mimeType || input.name) {
      throw new Error('Random billed-upload er slået fra. Vælg et billede/GIF fra Pixabay eller GIPHY.');
    }
    return null;
  }
  const safeMedia = SAFE_MEDIA_BY_ID.get(libraryId);
  const webMedia = safeMedia ? null : webMediaCacheGet(libraryId);
  const media = safeMedia || webMedia;
  if (!media) {
    if (/^(giphy|pixabay):/i.test(libraryId)) {
      throw new Error('Dette webmedie er udløbet. Søg efter GIF/foto igen og vælg det på ny.');
    }
    throw new Error('Du kan kun sende medier valgt fra Pixabay eller GIPHY-websøgningen.');
  }

  const url = media.url || media.dataUrl || media.thumbnailUrl || '';
  const thumbnailUrl = media.thumbnailUrl || media.dataUrl || url;
  return {
    type: 'image',
    libraryId: media.id,
    kind: media.kind || 'picture',
    mimeType: media.mimeType || 'image/jpeg',
    name: media.name || media.label || 'billede',
    label: media.label || media.name || 'billede',
    size: media.size || 0,
    source: media.source || 'tsn-web-media-search',
    provider: media.provider || '',
    providerUrl: media.providerUrl || '',
    attribution: media.attribution || '',
    dataUrl: url,
    url,
    thumbnailUrl
  };
}

function setMessageAttachment(message, attachment) {
  if (!attachment) return;
  message.attachmentType = 'image';
  message.attachmentLibraryId = attachment.libraryId || '';
  message.attachmentKind = attachment.kind || 'picture';
  message.attachmentSource = attachment.source || 'tsn-web-media-search';
  message.attachmentMimeType = attachment.mimeType;
  message.attachmentSize = attachment.size;
  message.attachmentNameEnc = encryptField(attachment.name || attachment.label || 'billede');
  message.attachmentDataUrlEnc = encryptField(attachment.dataUrl || attachment.url || attachment.thumbnailUrl || '');
  message.attachmentUrlEnc = encryptField(attachment.url || attachment.dataUrl || '');
  message.attachmentThumbnailUrlEnc = encryptField(attachment.thumbnailUrl || attachment.dataUrl || attachment.url || '');
  message.attachmentProviderEnc = encryptField(attachment.provider || '');
  message.attachmentProviderUrlEnc = encryptField(attachment.providerUrl || '');
  message.attachmentAttributionEnc = encryptField(attachment.attribution || '');
}

function publicMessageAttachment(message) {
  if (!message || message.attachmentType !== 'image') return null;
  const storedDataUrl = getEncryptedObjectField(message, 'attachmentDataUrl');
  const url = getEncryptedObjectField(message, 'attachmentUrl') || storedDataUrl;
  const thumbnailUrl = getEncryptedObjectField(message, 'attachmentThumbnailUrl') || storedDataUrl || url;
  if (!storedDataUrl && !url && !thumbnailUrl) return null;
  return {
    type: 'image',
    libraryId: message.attachmentLibraryId || '',
    kind: message.attachmentKind || 'picture',
    source: message.attachmentSource || (message.attachmentLibraryId ? 'website-media-search' : 'legacy-upload'),
    provider: getEncryptedObjectField(message, 'attachmentProvider'),
    providerUrl: getEncryptedObjectField(message, 'attachmentProviderUrl'),
    attribution: getEncryptedObjectField(message, 'attachmentAttribution'),
    mimeType: message.attachmentMimeType || '',
    name: getEncryptedObjectField(message, 'attachmentName') || 'billede',
    size: Number(message.attachmentSize) || 0,
    dataUrl: url || thumbnailUrl || storedDataUrl,
    url: url || storedDataUrl || thumbnailUrl,
    thumbnailUrl: thumbnailUrl || url || storedDataUrl
  };
}

function encryptedUserIdentity({ name, username, bio }) {
  return {
    nameEnc: encryptField(name),
    usernameEnc: encryptField(username),
    bioEnc: encryptField(bio || ''),
    usernameHash: lookupHash('username', normalizeUsername(username))
  };
}

function userMatchesUsername(user, username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  const possibleHashes = lookupHashes('username', normalized);
  return (
    possibleHashes.includes(user.usernameHash) ||
    normalizeUsername(getUserField(user, 'username')) === normalized
  );
}

function repairUserLookupHashIfNeeded(user, username) {
  const normalized = normalizeUsername(username);
  if (!user || !normalized) return false;
  const currentHash = lookupHash('username', normalized);
  if (currentHash && user.usernameHash !== currentHash) {
    user.usernameHash = currentHash;
    return true;
  }
  return false;
}

function findUserByLogin(users, loginValue) {
  const username = normalizeUsername(loginValue);
  return users.find((candidate) => userMatchesUsername(candidate, username));
}

function isRemovedEasyLoginUser(user) {
  const username = normalizeUsername(getUserField(user, 'username'));
  return username === 'demo_one' || username === 'demo_two' || /^guest_\d{4}$/.test(username);
}

function removeEasyLoginUsersFromDatabase(db) {
  const removedIds = new Set((db.users || []).filter(isRemovedEasyLoginUser).map((user) => user.id));
  if (!removedIds.size) {
    return { changed: false, usersRemoved: 0, globalMessagesRemoved: 0, privateMessagesRemoved: 0, commentsRemoved: 0, likesRemoved: 0, reportsRemoved: 0 };
  }

  const beforeGlobal = db.globalMessages.length;
  const beforePrivate = db.messages.length;
  const beforeReports = Array.isArray(db.reports) ? db.reports.length : 0;
  let commentsRemoved = 0;
  let likesRemoved = 0;

  db.users = db.users.filter((user) => !removedIds.has(user.id));
  db.globalMessages = db.globalMessages
    .filter((message) => !removedIds.has(message.authorId))
    .map((message) => {
      const beforeComments = Array.isArray(message.comments) ? message.comments.length : 0;
      const beforeLikes = Array.isArray(message.likes) ? message.likes.length : 0;
      message.comments = (Array.isArray(message.comments) ? message.comments : [])
        .filter((comment) => !removedIds.has(comment.authorId));
      message.likes = (Array.isArray(message.likes) ? message.likes : [])
        .filter((userId) => !removedIds.has(userId));
      commentsRemoved += beforeComments - message.comments.length;
      likesRemoved += beforeLikes - message.likes.length;
      return message;
    });
  db.messages = db.messages.filter((message) => !removedIds.has(message.from) && !removedIds.has(message.to));
  db.reports = (Array.isArray(db.reports) ? db.reports : []).filter((report) =>
    !removedIds.has(report.reporterId) &&
    !removedIds.has(report.targetUserId) &&
    !removedIds.has(report.reportedUserId)
  );

  return {
    changed: true,
    usersRemoved: removedIds.size,
    globalMessagesRemoved: beforeGlobal - db.globalMessages.length,
    privateMessagesRemoved: beforePrivate - db.messages.length,
    commentsRemoved,
    likesRemoved,
    reportsRemoved: beforeReports - db.reports.length
  };
}


function duplicateUserKey(user) {
  const username = normalizeUsername(getUserField(user, 'username'));
  if (username) return `username:${username}`;
  if (user?.usernameHash) return `hash:${user.usernameHash}`;
  return '';
}

function userContentScore(db, userId) {
  let score = 0;
  (db.globalMessages || []).forEach((message) => {
    if (message.authorId === userId) score += 10;
    (message.comments || []).forEach((comment) => {
      if (comment.authorId === userId) score += 3;
    });
    (message.likes || []).forEach((likeUserId) => {
      if (likeUserId === userId) score += 1;
    });
  });
  (db.messages || []).forEach((message) => {
    if (message.from === userId || message.to === userId) score += 2;
  });
  (db.reports || []).forEach((report) => {
    if (report.reporterId === userId || report.targetUserId === userId || report.reportedUserId === userId) score += 1;
  });
  return score;
}

function chooseDuplicateUserToKeep(db, users) {
  return [...users].sort((a, b) => {
    const adminDiff = Number(b.role === 'admin') - Number(a.role === 'admin');
    if (adminDiff) return adminDiff;
    const contentDiff = userContentScore(db, b.id) - userContentScore(db, a.id);
    if (contentDiff) return contentDiff;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  })[0];
}

function mergeDuplicateProfilesInDatabase(db) {
  const users = Array.isArray(db.users) ? db.users : [];
  const groups = new Map();

  users.forEach((user) => {
    const key = duplicateUserKey(user);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(user);
  });

  const duplicateToKeep = new Map();
  groups.forEach((group) => {
    if (group.length < 2) return;
    const keep = chooseDuplicateUserToKeep(db, group);
    group.forEach((user) => {
      if (user.id !== keep.id) duplicateToKeep.set(user.id, keep.id);
    });
  });

  if (!duplicateToKeep.size) return { changed: false, usersRemoved: 0, mergedIds: [] };

  const remapUserId = (userId) => duplicateToKeep.get(userId) || userId;
  const remapUserIdList = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(remapUserId).filter(Boolean))];

  db.globalMessages = (Array.isArray(db.globalMessages) ? db.globalMessages : []).map((message) => {
    message.authorId = remapUserId(message.authorId);
    message.likes = remapUserIdList(message.likes);
    message.comments = (Array.isArray(message.comments) ? message.comments : []).map((comment) => ({
      ...comment,
      authorId: remapUserId(comment.authorId)
    }));
    return message;
  });

  db.messages = (Array.isArray(db.messages) ? db.messages : []).map((message) => {
    message.from = remapUserId(message.from);
    message.to = remapUserId(message.to);
    message.readBy = remapUserIdList(message.readBy);
    if (message.from && message.to) message.conversationId = conversationId(message.from, message.to);
    return message;
  }).filter((message) => message.from && message.to && message.from !== message.to);

  db.reports = (Array.isArray(db.reports) ? db.reports : []).map((report) => ({
    ...report,
    reporterId: remapUserId(report.reporterId),
    targetUserId: remapUserId(report.targetUserId),
    reportedUserId: remapUserId(report.reportedUserId)
  }));

  db.roomMessages = (Array.isArray(db.roomMessages) ? db.roomMessages : []).map((message) => ({
    ...message,
    authorId: remapUserId(message.authorId)
  }));

  db.rooms = (Array.isArray(db.rooms) ? db.rooms : []).map((room) => ({
    ...room,
    ownerId: remapUserId(room.ownerId)
  }));

  const duplicateIds = new Set(duplicateToKeep.keys());
  db.users = users.filter((user) => !duplicateIds.has(user.id));

  return { changed: true, usersRemoved: duplicateIds.size, mergedIds: [...duplicateIds] };
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


function muteExpiresAtMs(user) {
  const value = user?.mutedUntil ? new Date(user.mutedUntil).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function isMuted(user) {
  return Boolean(user && muteExpiresAtMs(user) > Date.now());
}

function normalizeSpamText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\s+/g, ' ')
    .trim();
}

function clearExpiredMute(user) {
  if (!user || !user.mutedUntil) return false;
  if (muteExpiresAtMs(user) > Date.now()) return false;
  delete user.mutedUntil;
  delete user.mutedBy;
  delete user.muteReason;
  return true;
}

function userChatRestrictionMessage(user) {
  if (!user) return 'Brugeren blev ikke fundet.';
  if (isMuted(user)) {
    const until = new Date(user.mutedUntil).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
    return `Du er midlertidigt muted indtil ${until}. ${user.muteReason ? `Grund: ${user.muteReason}` : ''}`.trim();
  }
  clearExpiredMute(user);
  return '';
}

function registerSpamWarning(user, reason) {
  if (!user) return 'Spam blev blokeret.';
  user.spamWarnings = Math.max(0, Number(user.spamWarnings) || 0) + 1;
  user.lastSpamWarningAt = new Date().toISOString();
  user.lastSpamWarningReason = reason;

  if (user.spamWarnings >= AUTO_MUTE_AFTER_WARNINGS) {
    const mutedUntil = new Date(Date.now() + AUTO_MUTE_MINUTES * 60 * 1000).toISOString();
    user.mutedUntil = mutedUntil;
    user.muteReason = `Automatisk mute: ${reason}`.slice(0, 220);
    user.spamWarnings = 0;
    const until = new Date(mutedUntil).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
    return `Spam-filteret har muted dig indtil ${until}.`;
  }

  const remaining = Math.max(0, AUTO_MUTE_AFTER_WARNINGS - user.spamWarnings);
  return `${reason} Vent lidt før du sender igen. ${remaining} advarsel/advarsler før automatisk mute.`;
}

function applyChatAntiSpam(db, user, text, scope = 'chat') {
  if (!ANTI_SPAM_ENABLED) return null;
  const restriction = userChatRestrictionMessage(user);
  if (restriction) return restriction;

  const normalized = normalizeSpamText(text);
  if (!normalized) return null;

  const now = Date.now();
  const key = `${user.id}:${scope}`;
  const previous = (chatSpamMemory.get(key) || []).filter((entry) => now - entry.at <= Math.max(DUPLICATE_MESSAGE_WINDOW_MS, SPAM_WINDOW_MS));
  const last = previous[previous.length - 1] || null;

  if (last && now - last.at < MESSAGE_COOLDOWN_MS) {
    chatSpamMemory.set(key, previous);
    return registerSpamWarning(user, 'Du sender beskeder for hurtigt.');
  }

  const duplicateCount = previous.filter((entry) => entry.text === normalized && now - entry.at <= DUPLICATE_MESSAGE_WINDOW_MS).length;
  if (duplicateCount >= MAX_DUPLICATE_MESSAGES_PER_WINDOW) {
    chatSpamMemory.set(key, previous);
    return registerSpamWarning(user, 'Gentagne ens beskeder bliver blokeret.');
  }

  const recentCount = previous.filter((entry) => now - entry.at <= SPAM_WINDOW_MS).length;
  if (recentCount >= MAX_MESSAGES_PER_SPAM_WINDOW) {
    chatSpamMemory.set(key, previous);
    return registerSpamWarning(user, 'Du sender for mange beskeder på kort tid.');
  }

  previous.push({ at: now, text: normalized });
  chatSpamMemory.set(key, previous.slice(-80));
  return null;
}



function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function daysBetweenDateKeys(a, b) {
  if (!a || !b) return 999;
  const start = new Date(`${a}T00:00:00Z`).getTime();
  const end = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 999;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function levelFromXp(xp) {
  const amount = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.max(1, Math.floor(Math.sqrt(amount / 75)) + 1);
}

function xpForNextLevel(level) {
  const next = Math.max(2, Number(level) + 1);
  return Math.pow(next - 1, 2) * 75;
}

function addActivity(db, type, title, body = '', actorId = '', data = {}) {
  if (!db) return null;
  db.activityFeed = Array.isArray(db.activityFeed) ? db.activityFeed : [];
  const item = { id: id('act'), type: cleanText(type || 'activity', 40), title: cleanText(title || 'TSN aktivitet', 120), body: cleanText(body || '', 260), actorId: actorId || '', data: data && typeof data === 'object' ? data : {}, createdAt: new Date().toISOString() };
  db.activityFeed.push(item);
  if (db.activityFeed.length > ACTIVITY_FEED_LIMIT) db.activityFeed = db.activityFeed.slice(-ACTIVITY_FEED_LIMIT);
  return item;
}

function awardXp(db, userId, amount, reason = 'activity', data = {}) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  if (!db || !userId || !points) return null;
  const user = (Array.isArray(db.users) ? db.users : []).find((candidate) => candidate.id === userId);
  if (!user || isBanned(user)) return null;
  const beforeLevel = levelFromXp(user.xp);
  user.xp = Math.max(0, Math.floor(Number(user.xp) || 0)) + points;
  user.level = levelFromXp(user.xp);
  user.lastXpAt = new Date().toISOString();
  if (user.level > beforeLevel) {
    createNotification(db, user.id, 'level', `Du er nu level ${user.level}`, `Du fik ${points} XP for ${reason}.`, { xp: points, level: user.level, reason, ...data });
    addActivity(db, 'level-up', `${getUserField(user, 'name')} nåede level ${user.level}`, `${points} XP · ${reason}`, user.id, { level: user.level });
  }
  return { user, points, levelUp: user.level > beforeLevel };
}

function updateLoginStreak(db, user) {
  if (!db || !user) return user;
  const today = localDateKey();
  const previous = user.lastLoginDay || '';
  if (previous === today) { user.lastSeenAt = new Date().toISOString(); return user; }
  const diff = daysBetweenDateKeys(previous, today);
  user.loginStreak = diff === 1 ? Math.max(1, Number(user.loginStreak) || 0) + 1 : 1;
  user.bestLoginStreak = Math.max(Number(user.bestLoginStreak) || 0, user.loginStreak);
  user.lastLoginDay = today;
  user.lastSeenAt = new Date().toISOString();
  awardXp(db, user.id, XP_DAILY_LOGIN, 'dagligt login', { streak: user.loginStreak });
  if (user.loginStreak > 1) createNotification(db, user.id, 'streak', `${user.loginStreak} dages streak`, `Du har logget ind ${user.loginStreak} dage i træk.`, { streak: user.loginStreak });
  return user;
}

function activityItemPublic(item, users = []) {
  const actor = users.find((user) => user.id === item.actorId);
  return { id: item.id, type: item.type || 'activity', title: item.title || 'TSN aktivitet', body: item.body || '', actor: actor ? publicUser(actor) : null, data: item.data || {}, createdAt: item.createdAt };
}

function publicEvent(event, viewerId = '') {
  const participants = uniqueStringArray(event.participants);
  return { id: event.id, title: getEncryptedObjectField(event, 'title') || event.title || 'TSN event', description: getEncryptedObjectField(event, 'description') || event.description || '', startsAt: event.startsAt || null, endsAt: event.endsAt || null, status: event.status || 'open', createdAt: event.createdAt, participantCount: participants.length, joinedByMe: viewerId ? participants.includes(viewerId) : false };
}

function publicPoll(poll, viewerId = '') {
  const options = Array.isArray(poll.options) ? poll.options : [];
  const votes = poll.votes && typeof poll.votes === 'object' ? poll.votes : {};
  const viewerVote = viewerId ? String(votes[viewerId] || '') : '';
  const resultOptions = options.map((option) => {
    const idValue = String(option.id || '');
    const count = Object.values(votes).filter((vote) => String(vote) === idValue).length;
    return { id: idValue, text: getEncryptedObjectField(option, 'text') || option.text || '', count };
  });
  return { id: poll.id, question: getEncryptedObjectField(poll, 'question') || poll.question || 'Afstemning', options: resultOptions, totalVotes: resultOptions.reduce((total, option) => total + option.count, 0), votedByMe: Boolean(viewerVote), myVote: viewerVote, status: poll.status || 'open', createdAt: poll.createdAt };
}

function buildLeaderboard(db) {
  const users = (Array.isArray(db.users) ? db.users : []).filter((user) => !isBanned(user));
  const globalCounts = new Map();
  const privateCounts = new Map();
  const reactionCounts = new Map();
  (Array.isArray(db.globalMessages) ? db.globalMessages : []).forEach((message) => {
    globalCounts.set(message.authorId, (globalCounts.get(message.authorId) || 0) + 1);
    Object.values(message.reactions || {}).forEach((list) => { reactionCounts.set(message.authorId, (reactionCounts.get(message.authorId) || 0) + (Array.isArray(list) ? list.length : 0)); });
  });
  (Array.isArray(db.messages) ? db.messages : []).forEach((message) => { privateCounts.set(message.from, (privateCounts.get(message.from) || 0) + 1); });
  return users.map((user) => ({ user: publicUser(user), xp: Math.max(0, Number(user.xp) || 0), level: levelFromXp(user.xp), streak: Math.max(0, Number(user.loginStreak) || 0), globalMessages: globalCounts.get(user.id) || 0, privateMessagesSent: privateCounts.get(user.id) || 0, reactionsReceived: reactionCounts.get(user.id) || 0, score: Math.max(0, Number(user.xp) || 0) + (globalCounts.get(user.id) || 0) * 2 + (reactionCounts.get(user.id) || 0) * 3 })).sort((a, b) => b.score - a.score || b.level - a.level || b.xp - a.xp).slice(0, LEADERBOARD_LIMIT);
}

function uniqueStringArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))];
}

function ensureGrowthDatabaseShape(db) {
  if (!db || !Array.isArray(db.users)) return db;
  const usersByCreatedAt = [...db.users].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  usersByCreatedAt.forEach((user, index) => {
    if (!user.id) user.id = id('user');
    if (!user.createdAt) user.createdAt = new Date().toISOString();
    user.friends = uniqueStringArray(user.friends).filter((candidateId) => candidateId !== user.id);
    user.friendRequestsIn = uniqueStringArray(user.friendRequestsIn).filter((candidateId) => candidateId !== user.id && !user.friends.includes(candidateId));
    user.friendRequestsOut = uniqueStringArray(user.friendRequestsOut).filter((candidateId) => candidateId !== user.id && !user.friends.includes(candidateId));
    if (!Number.isFinite(Number(user.founderNumber))) user.founderNumber = index + 1;
    user.customBadges = normalizeCustomBadges(user.customBadges);
    user.warningCount = Math.max(0, Number(user.warningCount) || 0);
    user.xp = Math.max(0, Math.floor(Number(user.xp) || 0));
    user.level = levelFromXp(user.xp);
    user.loginStreak = Math.max(0, Math.floor(Number(user.loginStreak) || 0));
    user.bestLoginStreak = Math.max(user.loginStreak, Math.floor(Number(user.bestLoginStreak) || 0));
    user.lastLoginDay = cleanText(user.lastLoginDay || '', 20);
    user.lastSeenAt = user.lastSeenAt || user.createdAt;
  });

  db.users.forEach((user) => {
    user.friends = user.friends.filter((friendId) => db.users.some((candidate) => candidate.id === friendId));
    user.friendRequestsIn = user.friendRequestsIn.filter((fromId) => db.users.some((candidate) => candidate.id === fromId));
    user.friendRequestsOut = user.friendRequestsOut.filter((toId) => db.users.some((candidate) => candidate.id === toId));
  });

  db.notifications = (Array.isArray(db.notifications) ? db.notifications : []).filter((notification) => notification && notification.userId).slice(-NOTIFICATION_LIMIT);
  db.warnings = (Array.isArray(db.warnings) ? db.warnings : []).filter((warning) => warning && warning.userId).slice(-WARNINGS_LIMIT);
  db.activityFeed = (Array.isArray(db.activityFeed) ? db.activityFeed : []).filter((item) => item && item.type).slice(-ACTIVITY_FEED_LIMIT);
  db.events = (Array.isArray(db.events) ? db.events : []).filter((event) => event && event.id).slice(-EVENTS_LIMIT);
  db.polls = (Array.isArray(db.polls) ? db.polls : []).filter((poll) => poll && poll.id).slice(-POLLS_LIMIT);
  db.recoveryRequests = (Array.isArray(db.recoveryRequests) ? db.recoveryRequests : []).filter((request) => request && request.id);
  db.accountMerges = (Array.isArray(db.accountMerges) ? db.accountMerges : []).filter((merge) => merge && merge.id);
  return db;
}

function joinedDays(user) {
  const createdAt = new Date(user?.createdAt || 0).getTime();
  if (!Number.isFinite(createdAt) || createdAt <= 0) return 0;
  return Math.max(0, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
}

function normalizeCustomBadges(value) {
  const blockedDefaultLabels = new Set([DEFAULT_PROFILE_BADGE.toLowerCase()]);
  const labels = uniqueStringArray(value)
    .map((label) => cleanText(label, 24))
    .filter(Boolean)
    .filter((label) => !blockedDefaultLabels.has(label.toLowerCase()));
  return [...new Set(labels)].slice(0, MAX_CUSTOM_BADGES_PER_USER);
}

function badgeId(label) {
  return String(label || 'badge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'badge';
}

function userBadges(user) {
  if (!user) return [];
  const badges = [{ id: 'member', label: DEFAULT_PROFILE_BADGE, title: 'Standard TSN-medlem' }];
  normalizeCustomBadges(user.customBadges).forEach((label) => {
    badges.push({ id: `custom-${badgeId(label)}`, label, title: label });
  });
  return badges;
}

function hasCustomBadge(user, badgeLabel) {
  const target = String(badgeLabel || '').trim().toLowerCase();
  if (!user || !target) return false;
  return normalizeCustomBadges(user.customBadges).some((label) => label.toLowerCase() === target);
}

function isVerifiedAiUser(user) {
  return hasCustomBadge(user, 'Verified AI');
}

function friendStatus(viewer, target) {
  if (!viewer || !target || viewer.id === target.id) return 'self';
  const friends = uniqueStringArray(viewer.friends);
  const incoming = uniqueStringArray(viewer.friendRequestsIn);
  const outgoing = uniqueStringArray(viewer.friendRequestsOut);
  if (friends.includes(target.id)) return 'friends';
  if (incoming.includes(target.id)) return 'pending-in';
  if (outgoing.includes(target.id)) return 'pending-out';
  return 'none';
}

function publicUserForViewer(user, viewer) {
  const safe = publicUser(user);
  if (!safe) return null;
  return {
    ...safe,
    friendStatus: friendStatus(viewer, user),
    friendCount: uniqueStringArray(user.friends).length
  };
}

function publicNotification(notification) {
  return {
    id: notification.id,
    type: notification.type || 'info',
    title: getEncryptedObjectField(notification, 'title'),
    body: getEncryptedObjectField(notification, 'body'),
    data: notification.data || {},
    read: Boolean(notification.read),
    createdAt: notification.createdAt
  };
}

function createNotification(db, userId, type, title, body, data = {}) {
  if (!db || !userId || !db.users.some((user) => user.id === userId)) return null;
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  const notification = {
    id: id('note'),
    userId,
    type: String(type || 'info').slice(0, 40),
    ...encryptedTextObject('title', cleanText(title, 120) || 'TSN'),
    ...encryptedTextObject('body', cleanText(body, 400) || ''),
    data: data && typeof data === 'object' ? data : {},
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(notification);
  if (db.notifications.length > NOTIFICATION_LIMIT) db.notifications = db.notifications.slice(-NOTIFICATION_LIMIT);
  try {
    io.to(userId).emit('notification', publicNotification(notification));
  } catch {
    // Socket.io may not be ready during startup/tests.
  }
  return notification;
}

function extractMentionedUsers(db, text, excludedUserId = '') {
  const matches = String(text || '').match(/(^|\s)@([a-zA-Z0-9_.-]{2,32})/g) || [];
  const usernames = [...new Set(matches.map((match) => normalizeUsername(match.replace('@', '').trim())))];
  return usernames
    .map((username) => db.users.find((user) => userMatchesUsername(user, username)))
    .filter((user) => user && user.id !== excludedUserId && !isBanned(user));
}

function notifyMentions(db, text, sender, context = {}) {
  const mentionedUsers = extractMentionedUsers(db, text, sender?.id || '');
  mentionedUsers.forEach((targetUser) => {
    createNotification(
      db,
      targetUser.id,
      'mention',
      `${getUserField(sender, 'name') || 'En bruger'} nævnte dig`,
      String(text || '').slice(0, 220),
      context
    );
  });
}

function normalizeReactionsOnItem(item) {
  let changed = false;
  if (!item || typeof item !== 'object') return false;
  if (!item.reactions || typeof item.reactions !== 'object' || Array.isArray(item.reactions)) {
    item.reactions = {};
    changed = true;
  }
  for (const key of Object.keys(item.reactions)) {
    if (!ALLOWED_REACTIONS.has(key)) {
      delete item.reactions[key];
      changed = true;
      continue;
    }
    const uniqueUsers = uniqueStringArray(item.reactions[key]);
    if (uniqueUsers.length !== item.reactions[key].length) changed = true;
    item.reactions[key] = uniqueUsers;
  }
  return changed;
}

function publicReactions(item, viewerId = '', users = []) {
  normalizeReactionsOnItem(item);
  const userList = Array.isArray(users) ? users : [];
  const userMap = new Map(userList.map((user) => [user.id, user]));
  return [...ALLOWED_REACTIONS].map((emoji) => {
    const reactionUserIds = uniqueStringArray(item?.reactions?.[emoji]);
    const reactedBy = reactionUserIds.map((userId) => {
      const user = userMap.get(userId);
      return {
        id: userId,
        name: user ? getUserField(user, 'name') : 'Ukendt bruger',
        username: user ? getUserField(user, 'username') : ''
      };
    });
    return {
      emoji,
      count: reactionUserIds.length,
      reactedByMe: viewerId ? reactionUserIds.includes(viewerId) : false,
      reactedBy
    };
  });
}

function toggleReactionOnItem(item, userId, emoji) {
  if (!ALLOWED_REACTIONS.has(emoji)) throw new Error('Reaktionen understøttes ikke.');
  normalizeReactionsOnItem(item);
  item.reactions[emoji] = uniqueStringArray(item.reactions[emoji]);
  const existingIndex = item.reactions[emoji].indexOf(userId);
  const reacted = existingIndex < 0;
  if (reacted) item.reactions[emoji].push(userId);
  else item.reactions[emoji].splice(existingIndex, 1);
  return reacted;
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
    bio: getUserField(user, 'bio'),
    statusText: getUserField(user, 'status'),
    banner: getUserField(user, 'banner'),
    role,
    isAdmin: role === 'admin',
    banned: isBanned(user),
    bannedAt: user.bannedAt || null,
    muted: isMuted(user),
    mutedUntil: isMuted(user) ? user.mutedUntil : null,
    createdAt: user.createdAt,
    joinedDays: joinedDays(user),
    founderNumber: Number(user.founderNumber) || null,
    badges: userBadges(user),
    warningCount: Math.max(0, Number(user.warningCount) || 0),
    latestWarningAt: user.latestWarningAt || null,
    xp: Math.max(0, Math.floor(Number(user.xp) || 0)),
    level: levelFromXp(user.xp),
    nextLevelXp: xpForNextLevel(levelFromXp(user.xp)),
    loginStreak: Math.max(0, Math.floor(Number(user.loginStreak) || 0)),
    bestLoginStreak: Math.max(0, Math.floor(Number(user.bestLoginStreak) || 0))
  };
}

function getUserModerationStats(db, userId) {
  const globalMessages = Array.isArray(db?.globalMessages) ? db.globalMessages : [];
  const privateMessages = Array.isArray(db?.messages) ? db.messages : [];
  const reports = Array.isArray(db?.reports) ? db.reports : [];
  let commentsCount = 0;
  let likesGivenCount = 0;
  let lastActivityAt = null;

  const touch = (dateString) => {
    if (!dateString) return;
    const candidate = new Date(dateString);
    if (Number.isNaN(candidate.getTime())) return;
    if (!lastActivityAt || candidate > new Date(lastActivityAt)) lastActivityAt = dateString;
  };

  const globalPostsCount = globalMessages.filter((message) => {
    const isAuthor = message.authorId === userId;
    if (isAuthor) touch(message.createdAt);
    normalizeGlobalMessageInteractions(message);
    message.comments.forEach((comment) => {
      if (comment.authorId === userId) {
        commentsCount += 1;
        touch(comment.createdAt);
      }
    });
    if (message.likes.includes(userId)) likesGivenCount += 1;
    return isAuthor;
  }).length;

  const privateMessagesCount = privateMessages.filter((message) => {
    const isParticipant = message.from === userId || message.to === userId;
    if (isParticipant) touch(message.createdAt);
    return isParticipant;
  }).length;

  return {
    globalPostsCount,
    commentsCount,
    privateMessagesCount,
    likesGivenCount,
    reportsMadeCount: reports.filter((report) => report.reporterId === userId).length,
    reportsAgainstCount: reports.filter((report) => report.targetUserId === userId || report.reportedUserId === userId).length,
    openReportsAgainstCount: reports.filter((report) => (report.targetUserId === userId || report.reportedUserId === userId) && (report.status || 'open') === 'open').length,
    lastActivityAt
  };
}

function publicModerationUser(user, db = null) {
  const safe = publicUser(user);
  if (!safe) return null;
  return {
    ...safe,
    online: onlineUsers.has(user.id),
    banReason: user.banReason || '',
    bannedBy: user.bannedBy || null,
    muted: isMuted(user),
    mutedUntil: isMuted(user) ? user.mutedUntil : null,
    muteReason: user.muteReason || '',
    spamWarnings: Math.max(0, Number(user.spamWarnings) || 0),
    lastSpamWarningAt: user.lastSpamWarningAt || null,
    lastSpamWarningReason: user.lastSpamWarningReason || '',
    warningCount: Math.max(0, Number(user.warningCount) || 0),
    latestWarningAt: user.latestWarningAt || null,
    latestWarningReason: user.latestWarningReason || '',
    kickedAt: user.kickedAt || null,
    sessionVersion: getSessionVersion(user),
    stats: db ? getUserModerationStats(db, user.id) : null
  };
}

function buildAdminStats(db) {
  const users = Array.isArray(db.users) ? db.users : [];
  const globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const directMessages = Array.isArray(db.messages) ? db.messages : [];
  const reports = Array.isArray(db.reports) ? db.reports : [];
  const commentsCount = globalMessages.reduce((total, message) => {
    normalizeGlobalMessageInteractions(message);
    return total + message.comments.length;
  }, 0);
  const likesCount = globalMessages.reduce((total, message) => {
    normalizeGlobalMessageInteractions(message);
    return total + message.likes.length;
  }, 0);
  const openReports = reports.filter((report) => (report.status || 'open') === 'open');
  const resolvedReports = reports.filter((report) => (report.status || 'open') === 'resolved');
  const newestUser = [...users].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  const latestGlobalPost = [...globalMessages].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  const latestDirectMessage = [...directMessages].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;

  return {
    usersTotal: users.length,
    adminsTotal: users.filter((user) => user.role === 'admin').length,
    onlineUsers: users.filter((user) => onlineUsers.has(user.id)).length,
    bannedUsers: users.filter(isBanned).length,
    mutedUsers: users.filter(isMuted).length,
    spamWarnings: users.reduce((total, user) => total + Math.max(0, Number(user.spamWarnings) || 0), 0),
    moderationWarnings: users.reduce((total, user) => total + Math.max(0, Number(user.warningCount) || 0), 0),
    globalPosts: globalMessages.length,
    globalChatMessages: globalMessages.length,
    globalComments: commentsCount,
    globalLikes: likesCount,
    directMessages: directMessages.length,
    reportsTotal: reports.length,
    openReports: openReports.length,
    resolvedReports: resolvedReports.length,
    newestUser: newestUser ? adminMessageActor(newestUser) : null,
    newestUserAt: newestUser?.createdAt || null,
    latestGlobalPostAt: latestGlobalPost?.createdAt || null,
    latestDirectMessageAt: latestDirectMessage?.createdAt || null,
    generatedAt: new Date().toISOString()
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
  if (!payload) return res.status(401).json({ error: 'Du skal være logget ind.' });

  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === payload.sub);
  if (!user) return res.status(401).json({ error: 'Kontoen blev ikke fundet.', logout: true });
  if (isBanned(user)) return res.status(403).json({ error: 'Denne konto er banned.', logout: true });
  if (Number(payload.sv) !== getSessionVersion(user)) {
    return res.status(401).json({ error: 'Din session er udløbet. Log ind igen.', logout: true });
  }

  req.user = user;
  req.db = db;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin-rettigheder er påkrævet.' });
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
    attachment: publicMessageAttachment(message),
    createdAt: message.createdAt,
    author: publicUser(author)
  };
}

function publicGlobalComment(comment, users) {
  const author = users.find((user) => user.id === comment.authorId);
  return {
    id: comment.id,
    authorId: comment.authorId,
    text: getEncryptedObjectField(comment, 'text'),
    createdAt: comment.createdAt,
    author: publicUser(author)
  };
}

function normalizeGlobalMessageInteractions(message) {
  let changed = false;
  if (!Array.isArray(message.likes)) {
    message.likes = [];
    changed = true;
  }
  if (!Array.isArray(message.comments)) {
    message.comments = [];
    changed = true;
  }
  if (normalizeReactionsOnItem(message)) changed = true;

  const uniqueLikes = [...new Set(message.likes.filter(Boolean).map(String))];
  if (uniqueLikes.length !== message.likes.length || uniqueLikes.some((userId, index) => userId !== message.likes[index])) {
    message.likes = uniqueLikes;
    changed = true;
  }

  message.comments.forEach((comment) => {
    if (!comment.id) {
      comment.id = id('gcomment');
      changed = true;
    }
    if (!comment.createdAt) {
      comment.createdAt = message.createdAt || new Date().toISOString();
      changed = true;
    }
  });

  return changed;
}

function attachGlobalMessagePeople(message, users, viewerId = '') {
  normalizeGlobalMessageInteractions(message);
  const author = users.find((user) => user.id === message.authorId);
  const comments = [...message.comments]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((comment) => publicGlobalComment(comment, users));

  return {
    id: message.id,
    authorId: message.authorId,
    text: getEncryptedObjectField(message, 'text'),
    attachment: publicMessageAttachment(message),
    createdAt: message.createdAt,
    author: publicUser(author),
    likesCount: message.likes.length,
    likedByMe: viewerId ? message.likes.includes(viewerId) : false,
    reactions: publicReactions(message, viewerId, users),
    commentsCount: comments.length,
    comments
  };
}

function emitGlobalMessageUpdated(db, message) {
  for (const socket of io.sockets.sockets.values()) {
    const viewer = db.users.find((candidate) => candidate.id === socket.user?.id);
    if (viewer && !isBanned(viewer)) {
      socket.emit('global-message-updated', attachGlobalMessagePeople(message, db.users, viewer.id));
    }
  }
}

function publicMessage(message, viewerId = '', users = []) {
  const readBy = Array.isArray(message.readBy) ? [...new Set(message.readBy.filter(Boolean))] : [];
  return {
    id: message.id,
    conversationId: message.conversationId,
    from: message.from,
    to: message.to,
    text: getEncryptedObjectField(message, 'text'),
    attachment: publicMessageAttachment(message),
    createdAt: message.createdAt,
    transferNote: getEncryptedObjectField(message, 'transferNote'),
    transferredFromUserId: message.transferredFromUserId || '',
    transferredByMergeId: message.transferredByMergeId || '',
    reactions: publicReactions(message, viewerId, users),
    readBy,
    isReadByRecipient: Boolean(message.to && readBy.includes(message.to))
  };
}

function getReportReason(report) {
  return getEncryptedObjectField(report, 'reason');
}

function snapshotText(snapshot, field) {
  return getEncryptedObjectField(snapshot, field);
}

function snapshotActor(snapshot, prefix = 'author') {
  if (!snapshot) return adminMessageActor(null);
  return {
    id: snapshot[`${prefix}Id`] || '',
    name: snapshotText(snapshot, `${prefix}Name`) || 'Slettet bruger',
    username: snapshotText(snapshot, `${prefix}Username`) || 'deleted',
    role: '',
    isAdmin: false,
    banned: false,
    muted: false,
    online: false
  };
}

function buildActorSnapshot(target, prefix, user) {
  if (!user) return;
  target[`${prefix}Id`] = user.id;
  target[`${prefix}NameEnc`] = encryptField(getUserField(user, 'name') || 'Ukendt');
  target[`${prefix}UsernameEnc`] = encryptField(getUserField(user, 'username') || 'unknown');
}

function ensureReportSnapshot(db, report) {
  if (!report || typeof report !== 'object' || report.targetSnapshot) return false;

  const users = Array.isArray(db.users) ? db.users : [];
  const globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const directMessages = Array.isArray(db.messages) ? db.messages : [];
  const findUser = (userId) => users.find((user) => user.id === userId);
  const savedAt = report.createdAt || new Date().toISOString();
  const snapshot = { type: report.type || 'unknown', savedAt };

  if (report.type === 'global-message') {
    const message = globalMessages.find((candidate) => candidate.id === report.messageId);
    if (!message) return false;
    snapshot.label = 'Global chatbesked';
    snapshot.messageId = message.id;
    snapshot.createdAt = message.createdAt || null;
    snapshot.bodyEnc = encryptField(getEncryptedObjectField(message, 'text'));
    buildActorSnapshot(snapshot, 'author', findUser(message.authorId));
  } else if (report.type === 'global-comment') {
    const message = globalMessages.find((candidate) => candidate.id === report.messageId);
    if (!message) return false;
    normalizeGlobalMessageInteractions(message);
    const comment = message.comments.find((candidate) => candidate.id === report.commentId);
    if (!comment) return false;
    snapshot.label = 'Historisk global kommentar';
    snapshot.messageId = message.id;
    snapshot.commentId = comment.id;
    snapshot.createdAt = comment.createdAt || null;
    snapshot.bodyEnc = encryptField(getEncryptedObjectField(comment, 'text'));
    snapshot.parentBodyEnc = encryptField(getEncryptedObjectField(message, 'text'));
    buildActorSnapshot(snapshot, 'author', findUser(comment.authorId));
  } else if (report.type === 'direct-message') {
    const message = directMessages.find((candidate) => candidate.id === report.messageId);
    if (!message) return false;
    snapshot.label = 'Privat besked';
    snapshot.messageId = message.id;
    snapshot.conversationId = message.conversationId || conversationId(message.from, message.to);
    snapshot.createdAt = message.createdAt || null;
    snapshot.privateBodyEnc = encryptField(getEncryptedObjectField(message, 'text'));
    snapshot.privateBodyVisibleToAdminsWhenReported = true;
    buildActorSnapshot(snapshot, 'author', findUser(message.from));
    buildActorSnapshot(snapshot, 'toUser', findUser(message.to));
  } else if (report.type === 'user') {
    const targetUser = findUser(report.targetUserId);
    if (!targetUser) return false;
    snapshot.label = 'Bruger';
    snapshot.userId = targetUser.id;
    snapshot.createdAt = targetUser.createdAt || null;
    snapshot.bodyEnc = encryptField(`${getUserField(targetUser, 'name')} (@${getUserField(targetUser, 'username')})`);
    buildActorSnapshot(snapshot, 'author', targetUser);

    if (report.contextMessageId) {
      const contextMessage = directMessages.find((candidate) => candidate.id === report.contextMessageId);
      if (contextMessage) {
        snapshot.contextMessageId = contextMessage.id;
        snapshot.contextConversationId = contextMessage.conversationId || conversationId(contextMessage.from, contextMessage.to);
        snapshot.contextCreatedAt = contextMessage.createdAt || null;
        snapshot.contextPrivateBodyEnc = encryptField(getEncryptedObjectField(contextMessage, 'text'));
        snapshot.contextPrivateBodyVisibleToAdminsWhenReported = true;
        buildActorSnapshot(snapshot, 'contextAuthor', findUser(contextMessage.from));
        buildActorSnapshot(snapshot, 'contextToUser', findUser(contextMessage.to));
      }
    }
  } else {
    return false;
  }

  report.targetSnapshot = snapshot;
  return true;
}

function reportStatusLabel(status) {
  return status === 'resolved' ? 'løst' : 'åben';
}

function findReportTarget(db, report) {
  const users = Array.isArray(db.users) ? db.users : [];
  const globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const directMessages = Array.isArray(db.messages) ? db.messages : [];
  const findUser = (userId) => users.find((user) => user.id === userId);
  const snapshot = report.targetSnapshot || null;
  const snapshotBody = snapshotText(snapshot, 'body');
  const snapshotParentBody = snapshotText(snapshot, 'parentBody');

  if (report.type === 'global-message') {
    const message = globalMessages.find((candidate) => candidate.id === report.messageId);
    const author = message ? findUser(message.authorId) : null;
    return {
      exists: Boolean(message),
      originalExists: Boolean(message),
      snapshotSaved: Boolean(snapshot?.savedAt),
      snapshotSavedAt: snapshot?.savedAt || null,
      type: report.type,
      label: 'Global chatbesked',
      body: snapshotBody || (message ? getEncryptedObjectField(message, 'text') : 'Chatbeskeden findes ikke længere.'),
      createdAt: message?.createdAt || snapshot?.createdAt || null,
      author: message ? adminMessageActor(author) : snapshotActor(snapshot, 'author'),
      messageId: report.messageId
    };
  }

  if (report.type === 'global-comment') {
    const message = globalMessages.find((candidate) => candidate.id === report.messageId);
    const comments = message ? (Array.isArray(message.comments) ? message.comments : []) : [];
    const comment = comments.find((candidate) => candidate.id === report.commentId);
    const author = comment ? findUser(comment.authorId) : null;
    return {
      exists: Boolean(message && comment),
      originalExists: Boolean(message && comment),
      snapshotSaved: Boolean(snapshot?.savedAt),
      snapshotSavedAt: snapshot?.savedAt || null,
      type: report.type,
      label: 'Historisk global kommentar',
      body: snapshotBody || (comment ? getEncryptedObjectField(comment, 'text') : 'Kommentaren findes ikke længere.'),
      parentBody: snapshotParentBody || (message ? getEncryptedObjectField(message, 'text') : ''),
      createdAt: comment?.createdAt || snapshot?.createdAt || null,
      author: comment ? adminMessageActor(author) : snapshotActor(snapshot, 'author'),
      messageId: report.messageId,
      commentId: report.commentId
    };
  }

  if (report.type === 'direct-message') {
    const message = directMessages.find((candidate) => candidate.id === report.messageId);
    const fromUser = message ? findUser(message.from) : null;
    const toUser = message ? findUser(message.to) : null;
    return {
      exists: Boolean(message),
      originalExists: Boolean(message),
      snapshotSaved: Boolean(snapshot?.savedAt),
      snapshotSavedAt: snapshot?.savedAt || null,
      type: report.type,
      label: 'Privat besked',
      body: snapshotText(snapshot, 'privateBody') || (message ? getEncryptedObjectField(message, 'text') : 'Beskeden findes ikke længere.'),
      createdAt: message?.createdAt || snapshot?.createdAt || null,
      author: message ? adminMessageActor(fromUser) : snapshotActor(snapshot, 'author'),
      toUser: message ? adminMessageActor(toUser) : snapshotActor(snapshot, 'toUser'),
      messageId: report.messageId,
      conversationId: message?.conversationId || snapshot?.conversationId || ''
    };
  }

  if (report.type === 'user') {
    const targetUser = findUser(report.targetUserId);
    return {
      exists: Boolean(targetUser),
      originalExists: Boolean(targetUser),
      snapshotSaved: Boolean(snapshot?.savedAt),
      snapshotSavedAt: snapshot?.savedAt || null,
      contextSaved: Boolean(snapshot?.contextPrivateBodyEnc),
      contextBody: snapshotText(snapshot, 'contextPrivateBody'),
      contextAuthor: snapshotActor(snapshot, 'contextAuthor'),
      contextToUser: snapshotActor(snapshot, 'contextToUser'),
      contextCreatedAt: snapshot?.contextCreatedAt || null,
      type: report.type,
      label: 'Bruger',
      body: snapshotBody || (targetUser ? `${getUserField(targetUser, 'name')} (@${getUserField(targetUser, 'username')})` : 'Brugeren findes ikke længere.'),
      createdAt: targetUser?.createdAt || snapshot?.createdAt || null,
      author: targetUser ? adminMessageActor(targetUser) : snapshotActor(snapshot, 'author'),
      userId: report.targetUserId
    };
  }

  return { exists: false, originalExists: false, snapshotSaved: Boolean(snapshot?.savedAt), snapshotSavedAt: snapshot?.savedAt || null, type: report.type || 'ukendt', label: 'Ukendt rapport', body: snapshotBody || 'Målet findes ikke.', createdAt: snapshot?.createdAt || null };
}

function publicReport(db, report) {
  const reporter = db.users.find((user) => user.id === report.reporterId);
  return {
    id: report.id,
    type: report.type,
    status: report.status || 'open',
    statusLabel: reportStatusLabel(report.status || 'open'),
    reason: getReportReason(report),
    reporter: adminMessageActor(reporter),
    target: findReportTarget(db, report),
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt || null,
    resolvedBy: report.resolvedBy || null
  };
}

function removeGlobalMessageById(db, messageId) {
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const index = db.globalMessages.findIndex((candidate) => candidate.id === messageId);
  if (index < 0) return null;
  const [deleted] = db.globalMessages.splice(index, 1);
  return deleted;
}

function removeGlobalCommentById(db, messageId, commentId) {
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === messageId);
  if (!message) return null;
  normalizeGlobalMessageInteractions(message);
  const index = message.comments.findIndex((candidate) => candidate.id === commentId);
  if (index < 0) return null;
  const [deleted] = message.comments.splice(index, 1);
  return { message, comment: deleted };
}

function removeDirectMessageById(db, messageId) {
  db.messages = Array.isArray(db.messages) ? db.messages : [];
  const index = db.messages.findIndex((candidate) => candidate.id === messageId);
  if (index < 0) return null;
  const [deleted] = db.messages.splice(index, 1);
  return deleted;
}

function deleteUserDataFromDatabase(db, userId) {
  const beforeUsers = db.users.length;
  const beforeGlobalMessages = db.globalMessages.length;
  const beforePrivateMessages = db.messages.length;
  let commentsRemoved = 0;
  let likesRemoved = 0;

  db.users = db.users.filter((user) => user.id !== userId);
  db.globalMessages = (Array.isArray(db.globalMessages) ? db.globalMessages : [])
    .filter((message) => message.authorId !== userId)
    .map((message) => {
      normalizeGlobalMessageInteractions(message);
      const beforeComments = message.comments.length;
      const beforeLikes = message.likes.length;
      message.comments = message.comments.filter((comment) => comment.authorId !== userId);
      message.likes = message.likes.filter((likeUserId) => likeUserId !== userId);
      normalizeReactionsOnItem(message);
      Object.keys(message.reactions || {}).forEach((emoji) => {
        message.reactions[emoji] = message.reactions[emoji].filter((reactionUserId) => reactionUserId !== userId);
      });
      commentsRemoved += beforeComments - message.comments.length;
      likesRemoved += beforeLikes - message.likes.length;
      return message;
    });
  db.messages = (Array.isArray(db.messages) ? db.messages : []).filter((message) => message.from !== userId && message.to !== userId);
  db.users.forEach((user) => {
    user.friends = uniqueStringArray(user.friends).filter((friendId) => friendId !== userId);
    user.friendRequestsIn = uniqueStringArray(user.friendRequestsIn).filter((friendId) => friendId !== userId);
    user.friendRequestsOut = uniqueStringArray(user.friendRequestsOut).filter((friendId) => friendId !== userId);
  });
  db.notifications = (Array.isArray(db.notifications) ? db.notifications : []).filter((notification) => notification.userId !== userId);
  db.warnings = (Array.isArray(db.warnings) ? db.warnings : []).filter((warning) => warning.userId !== userId && warning.issuedBy !== userId);
  db.reports = (Array.isArray(db.reports) ? db.reports : []).filter((report) =>
    report.reporterId !== userId && report.targetUserId !== userId && report.reportedUserId !== userId
  );

  return {
    usersRemoved: beforeUsers - db.users.length,
    globalMessagesRemoved: beforeGlobalMessages - db.globalMessages.length,
    privateMessagesRemoved: beforePrivateMessages - db.messages.length,
    commentsRemoved,
    likesRemoved
  };
}


function adminMessageActor(user) {
  const safe = publicUser(user);
  return safe ? { id: safe.id, name: safe.name, username: safe.username, role: safe.role } : null;
}

function buildAdminMessageArchive(db) {
  const users = Array.isArray(db.users) ? db.users : [];
  const items = [];

  const findUser = (userId) => users.find((user) => user.id === userId);
  const makeSearchText = (item) => [
    item.kind,
    item.source,
    item.body,
    item.author?.name,
    item.author?.username,
    item.fromUser?.name,
    item.fromUser?.username,
    item.toUser?.name,
    item.toUser?.username
  ].filter(Boolean).join(' ').toLowerCase();

  const pushItem = (item) => {
    items.push({ ...item, searchText: makeSearchText(item) });
  };

  (Array.isArray(db.globalMessages) ? db.globalMessages : []).forEach((message) => {
    normalizeGlobalMessageInteractions(message);
    pushItem({
      id: `global:${message.id}`,
      kind: 'global-message',
      label: 'global besked',
      source: 'Global chat',
      messageId: message.id,
      author: adminMessageActor(findUser(message.authorId)),
      body: getEncryptedObjectField(message, 'text') || '',
      createdAt: message.createdAt,
      likesCount: message.likes.length,
      commentsCount: message.comments.length
    });

    message.comments.forEach((comment) => {
      pushItem({
        id: `global-comment:${message.id}:${comment.id}`,
        kind: 'global-comment',
        label: 'historisk global kommentar',
        source: 'Historisk kommentar til global chat',
        messageId: message.id,
        commentId: comment.id,
        author: adminMessageActor(findUser(comment.authorId)),
        body: getEncryptedObjectField(comment, 'text'),
        parentBody: getEncryptedObjectField(message, 'text'),
        parentAuthor: adminMessageActor(findUser(message.authorId)),
        createdAt: comment.createdAt
      });
    });
  });

  (Array.isArray(db.messages) ? db.messages : []).forEach((message) => {
    const fromUser = findUser(message.from);
    if (!isVerifiedAiUser(fromUser)) return;
    const body = getEncryptedObjectField(message, 'text') || '';
    const hasImage = Boolean(message.attachment);
    pushItem({
      id: `direct:${message.id}`,
      kind: 'direct-message',
      label: 'Verified AI privat besked',
      source: 'Privat chat · Verified AI',
      messageId: message.id,
      conversationId: message.conversationId,
      fromUser: adminMessageActor(fromUser),
      toUser: adminMessageActor(findUser(message.to)),
      body: body || (hasImage ? '[billede/GIF]' : ''),
      hasImage,
      createdAt: message.createdAt,
      readByCount: Array.isArray(message.readBy) ? message.readBy.length : 0,
      verifiedAiEvidence: true
    });
  });

  return items
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function publicAdminMessageItem(item) {
  const { searchText, ...safeItem } = item;
  return safeItem;
}

function hasReadMessage(message, userId) {
  return Array.isArray(message.readBy) && message.readBy.includes(userId);
}

function isMessageHiddenFor(message, userId) {
  return Array.isArray(message.deletedFor) && message.deletedFor.includes(userId);
}

function hideMessageForUser(message, userId) {
  if (!Array.isArray(message.deletedFor)) message.deletedFor = [];
  if (!message.deletedFor.includes(userId)) message.deletedFor.push(userId);
}

function getUnreadMessageCount(db, currentUserId, otherUserId) {
  return db.messages.filter((message) =>
    message.from === otherUserId &&
    message.to === currentUserId &&
    !isMessageHiddenFor(message, currentUserId) &&
    !hasReadMessage(message, currentUserId)
  ).length;
}

async function markConversationRead(db, currentUserId, otherUserId) {
  let changed = false;
  const key = conversationId(currentUserId, otherUserId);
  const readMessageIds = [];

  db.messages.forEach((message) => {
    if (message.conversationId !== key || message.to !== currentUserId || isMessageHiddenFor(message, currentUserId)) return;
    if (!Array.isArray(message.readBy)) message.readBy = message.from && message.to ? [message.from, message.to] : [];
    if (message.from && !message.readBy.includes(message.from)) message.readBy.push(message.from);
    if (!message.readBy.includes(currentUserId)) {
      message.readBy.push(currentUserId);
      readMessageIds.push(message.id);
      changed = true;
    }
  });

  if (changed) {
    await writeDb(db);
    io.to(currentUserId).emit('messages-read', {
      userId: otherUserId,
      conversationId: key,
      unreadCount: 0,
      readByUserId: currentUserId,
      readMessageIds
    });
    io.to(otherUserId).emit('messages-read', {
      userId: currentUserId,
      conversationId: key,
      unreadCount: 0,
      readByUserId: currentUserId,
      readMessageIds
    });
  }

  return changed;
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

async function migrateDatabaseAtRest() {
  const db = readDb();
  let changed = false;

  db.users.forEach((user) => {
    const plainUsername = user.username;
    if (user.sessionVersion === undefined) {
      user.sessionVersion = 0;
      changed = true;
    }

    if (!user.roomAccessVersions || typeof user.roomAccessVersions !== 'object' || Array.isArray(user.roomAccessVersions)) {
      user.roomAccessVersions = {};
      changed = true;
    }

    ['name', 'username', 'bio'].forEach((field) => {
      if (migrateRecordField(user, field)) changed = true;
    });

    if (!user.usernameHash) {
      const username = plainUsername || getUserField(user, 'username');
      if (username) {
        user.usernameHash = lookupHash('username', normalizeUsername(username));
        changed = true;
      }
    }

    ['email', 'emailEnc', 'emailHash'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(user, field)) {
        delete user[field];
        changed = true;
      }
    });
  });

  const easyLoginCleanup = removeEasyLoginUsersFromDatabase(db);
  if (easyLoginCleanup.changed) {
    changed = true;
    console.log(`Removed ${easyLoginCleanup.usersRemoved} guest/demo user(s), ${easyLoginCleanup.globalMessagesRemoved} global message(s), and ${easyLoginCleanup.privateMessagesRemoved} private message(s).`);
  }

  const duplicateProfileCleanup = mergeDuplicateProfilesInDatabase(db);
  if (duplicateProfileCleanup.changed) {
    changed = true;
    console.log(`Merged and removed ${duplicateProfileCleanup.usersRemoved} duplicate TSN profile(s).`);
  }

  db.posts.forEach((post) => {
    if (migrateRecordField(post, 'body')) changed = true;
    (post.comments || []).forEach((comment) => {
      if (migrateRecordField(comment, 'body')) changed = true;
    });
  });

  if (!Array.isArray(db.globalMessages)) {
    db.globalMessages = [];
    changed = true;
  }

  db.globalMessages.forEach((message) => {
    if (migrateRecordField(message, 'text')) changed = true;
    if (normalizeGlobalMessageInteractions(message)) changed = true;
    message.comments.forEach((comment) => {
      if (migrateRecordField(comment, 'text')) changed = true;
    });
  });

  db.messages.forEach((message) => {
    if (migrateRecordField(message, 'text')) changed = true;
    if (!Array.isArray(message.readBy)) {
      // Existing messages from older TSN versions are treated as already read so updating does not create old unread badges.
      message.readBy = [message.from, message.to].filter(Boolean);
      changed = true;
    } else if (message.from && !message.readBy.includes(message.from)) {
      message.readBy.push(message.from);
      changed = true;
    }
  });

  if (!Array.isArray(db.rooms)) {
    db.rooms = [];
    changed = true;
  }

  if (!Array.isArray(db.roomMessages)) {
    db.roomMessages = [];
    changed = true;
  }

  if (!Array.isArray(db.reports)) {
    db.reports = [];
    changed = true;
  }

  const normalizedStock = normalizeTsnStockState(db.tsnStock);
  if (JSON.stringify(normalizedStock) !== JSON.stringify(db.tsnStock)) {
    db.tsnStock = normalizedStock;
    changed = true;
  }

  db.reports.forEach((report) => {
    if (migrateRecordField(report, 'reason')) changed = true;
    if (!report.status) {
      report.status = 'open';
      changed = true;
    }
    if (!report.createdAt) {
      report.createdAt = new Date().toISOString();
      changed = true;
    }
    if (ensureReportSnapshot(db, report)) changed = true;
  });

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
    const storedRoomName = record.nameEnc ? getEncryptedObjectField(record, 'name').trim() : '';
    if (storedRoomName.startsWith(`Room ${room.id}: `)) {
      // Earlier TSN versions shipped topic-style default names.
      // Clear those defaults so existing databases now show plain "Room 1", "Room 2", etc.
      record.nameEnc = '';
      changed = true;
    }
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
    await writeDb(db);
    console.log('Migrated legacy/plain database fields to the current encrypted TSN format.');
  }
}

app.post('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const backupFile = backupDatabase('admin');
    res.json({ ok: true, backupFile });
  } catch (error) {
    res.status(500).json({ error: `Backup fejlede: ${error.message}` });
  }
});

app.get('/api/health', (req, res) => {
  try {
    const storage = getStorageStatus();
    res.json({
      ok: true,
      app: 'TSN V1.5.32',
      shortName: 'TSN V1.5.32',
      environment: process.env.NODE_ENV || 'development',
      storage: {
        ok: storage.ok,
        mode: storage.mode,
        dataDir: storage.dataDir,
        dbFile: storage.dbFile,
        mongoDatabase: storage.mongoDatabase,
        mongoCollection: storage.mongoCollection,
        mongoStateId: storage.mongoStateId,
        backupDir: storage.backupDir,
        persistenceWarning: storage.persistenceWarning
      },
      security: {
        accountPasswords: 'bcrypt-hashed, never readable; recovery uses one-time reset codes',
        userIdentityFields: 'aes-256-gcm encrypted',
        globalMessages: 'aes-256-gcm encrypted at rest',
        privateMessages: 'aes-256-gcm encrypted at rest',
        usernameLookup: 'hmac-sha256',
        sessions: 'versioned JWT sessions support admin kick/logout',
        moderation: 'admins can review global messages and reported private-message evidence, handle reports, kick accounts, ban accounts, unban accounts, and see private-message counts without browsing all private-message content',
        contentFilter: CONTENT_FILTER_ENABLED ? 'server-side blocked-language filter enabled' : 'disabled',
        customBlockedWords: CUSTOM_BLOCKED_WORDS.length,
        callNetworking: CALL_TURN_ENABLED ? 'STUN + TURN configured for cross-network WebRTC calls' : 'STUN only; add TURN env vars for reliable strict-NAT cross-network calls',
        adminRights: 'claimable with server-side admin setup password'
      }
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      app: 'TSN V1.5.32',
      shortName: 'TSN V1.5.32',
      error: 'Lageret er ikke klar.',
      detail: error.message
    });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    app: 'TSN V1.5.32',
    message: 'pong',
    now: new Date().toISOString()
  });
});


function generateRecoveryCode() {
  return crypto.randomBytes(18).toString('base64url');
}

function recoveryRequestPublic(db, request, viewer = null) {
  const oldUser = db.users.find((user) => user.id === request.oldUserId);
  const requester = db.users.find((user) => user.id === request.requesterId);
  const canSeeCode = viewer && (viewer.role === 'admin' || viewer.id === request.requesterId);
  return {
    id: request.id,
    status: request.status || 'pending',
    oldUsername: request.oldUsername || (oldUser ? getUserField(oldUser, 'username') : ''),
    oldUser: oldUser ? publicUser(oldUser) : null,
    requester: requester ? publicUser(requester) : null,
    note: getEncryptedObjectField(request, 'note'),
    adminNote: getEncryptedObjectField(request, 'adminNote'),
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt || null,
    usedAt: request.usedAt || null,
    resetCode: canSeeCode && request.status === 'approved' && !request.usedAt ? request.resetCode : ''
  };
}

function pendingMergePublic(db, merge) {
  if (!merge || merge.status !== 'pending') return null;
  const primary = db.users.find((user) => user.id === merge.primaryUserId);
  const secondary = db.users.find((user) => user.id === merge.secondaryUserId);
  return {
    id: merge.id,
    primaryUser: primary ? publicUser(primary) : null,
    secondaryUser: secondary ? publicUser(secondary) : null,
    createdAt: merge.createdAt
  };
}

function replaceUserIdEverywhere(value, fromId, toId) {
  if (!value || !fromId || !toId) return value;
  if (typeof value === 'string') return value === fromId ? toId : value;
  if (Array.isArray(value)) return uniqueStringArray(value.map((item) => replaceUserIdEverywhere(item, fromId, toId)));
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      value[key] = replaceUserIdEverywhere(value[key], fromId, toId);
    });
  }
  return value;
}

function remapPrivateMessagesForAccountMerge(db, { primaryId, secondaryId, secondaryUsername, mergeId }) {
  const affectedUserIds = new Set();
  let movedMessages = 0;
  let transferredSentMessages = 0;
  const transferNote = `Overført besked fra den gamle konto ${secondaryUsername || 'User02'}`;

  db.messages = (Array.isArray(db.messages) ? db.messages : []).map((message) => {
    if (!message || typeof message !== 'object') return message;
    const fromSecondary = message.from === secondaryId;
    const toSecondary = message.to === secondaryId;
    if (!fromSecondary && !toSecondary) return message;

    const otherUserId = fromSecondary ? message.to : message.from;
    if (otherUserId && otherUserId !== primaryId && otherUserId !== secondaryId) affectedUserIds.add(otherUserId);

    message.from = fromSecondary ? primaryId : message.from;
    message.to = toSecondary ? primaryId : message.to;
    message.readBy = uniqueStringArray(uniqueStringArray(message.readBy).map((idValue) => idValue === secondaryId ? primaryId : idValue).filter(Boolean));
    if (message.from && !message.readBy.includes(message.from)) message.readBy.push(message.from);
    if (message.deletedFor) {
      // Do not carry the temporary account's local hide-state into the recovered account;
      // otherwise User01 may still be unable to see messages originally written as User02.
      message.deletedFor = uniqueStringArray(message.deletedFor).filter((idValue) => idValue !== secondaryId);
    }
    if (message.from && message.to) message.conversationId = conversationId(message.from, message.to);

    if (fromSecondary) {
      Object.assign(message, encryptedTextObject('transferNote', transferNote));
      message.transferredFromUserId = secondaryId;
      message.transferredByMergeId = mergeId;
      message.transferredAt = new Date().toISOString();
      transferredSentMessages += 1;
    }
    movedMessages += 1;
    return message;
  }).filter((message) => message && message.from && message.to && message.from !== message.to);

  return { movedMessages, transferredSentMessages, affectedUserIds: [...affectedUserIds] };
}

function mergeUserAccounts(db, merge) {
  const primary = db.users.find((user) => user.id === merge.primaryUserId);
  const secondaryIndex = db.users.findIndex((user) => user.id === merge.secondaryUserId);
  if (!primary || secondaryIndex < 0) throw new Error('Kontiene til sammenlægning blev ikke fundet.');
  const secondary = db.users[secondaryIndex];
  const primaryId = primary.id;
  const secondaryId = secondary.id;
  const secondaryUsername = getUserField(secondary, 'username') || 'User02';

  // Transfer visible account stats/status.
  primary.xp = Math.max(0, Math.floor(Number(primary.xp) || 0)) + Math.max(0, Math.floor(Number(secondary.xp) || 0));
  primary.level = levelFromXp(primary.xp);
  primary.loginStreak = Math.max(Number(primary.loginStreak) || 0, Number(secondary.loginStreak) || 0);
  primary.bestLoginStreak = Math.max(Number(primary.bestLoginStreak) || 0, Number(secondary.bestLoginStreak) || 0);
  primary.warningCount = Math.max(Number(primary.warningCount) || 0, Number(secondary.warningCount) || 0);
  primary.customBadges = normalizeCustomBadges([...(primary.customBadges || []), ...(secondary.customBadges || [])]);
  primary.friends = uniqueStringArray([...(primary.friends || []), ...(secondary.friends || [])]).filter((idValue) => idValue !== primaryId && idValue !== secondaryId);
  primary.friendRequestsIn = uniqueStringArray([...(primary.friendRequestsIn || []), ...(secondary.friendRequestsIn || [])]).filter((idValue) => idValue !== primaryId && idValue !== secondaryId && !primary.friends.includes(idValue));
  primary.friendRequestsOut = uniqueStringArray([...(primary.friendRequestsOut || []), ...(secondary.friendRequestsOut || [])]).filter((idValue) => idValue !== primaryId && idValue !== secondaryId && !primary.friends.includes(idValue));

  // Private messages need special handling because the conversationId contains both user IDs.
  // Messages written by the temporary account become messages from the recovered account,
  // and the other person sees a Danish transfer note under those bubbles.
  const messageTransfer = remapPrivateMessagesForAccountMerge(db, {
    primaryId,
    secondaryId,
    secondaryUsername,
    mergeId: merge.id
  });

  // Transfer every other reference from the temporary account to the recovered account.
  ['globalMessages', 'roomMessages', 'reports', 'notifications', 'warnings', 'activityFeed', 'events', 'polls', 'recoveryRequests'].forEach((collectionName) => {
    if (Array.isArray(db[collectionName])) replaceUserIdEverywhere(db[collectionName], secondaryId, primaryId);
  });
  db.users.forEach((user) => {
    user.friends = uniqueStringArray(user.friends).map((idValue) => idValue === secondaryId ? primaryId : idValue).filter((idValue) => idValue !== user.id);
    user.friendRequestsIn = uniqueStringArray(user.friendRequestsIn).map((idValue) => idValue === secondaryId ? primaryId : idValue).filter((idValue) => idValue !== user.id && !user.friends.includes(idValue));
    user.friendRequestsOut = uniqueStringArray(user.friendRequestsOut).map((idValue) => idValue === secondaryId ? primaryId : idValue).filter((idValue) => idValue !== user.id && !user.friends.includes(idValue));
  });

  db.users.splice(secondaryIndex, 1);
  merge.status = 'completed';
  merge.completedAt = new Date().toISOString();
  merge.summary = {
    secondaryDeleted: true,
    messagesTransferred: true,
    statsTransferred: true,
    movedMessages: messageTransfer.movedMessages,
    transferredSentMessages: messageTransfer.transferredSentMessages,
    secondaryUsername
  };
  primary.sessionVersion = Number(primary.sessionVersion || 0) + 1;
  createNotification(db, primaryId, 'account-recovery', 'Konti sammenlagt', `Beskeder og stats fra ${secondaryUsername} er nu overført til din gamle konto.`, { mergeId: merge.id });
  addActivity(db, 'account-merge', `${getUserField(primary, 'name')} fik to konti sammenlagt`, 'Kontogendannelse gennemført sikkert uden at vise gamle adgangskoder.', primaryId, { mergeId: merge.id });
  return { primary, secondary, affectedUserIds: messageTransfer.affectedUserIds, movedMessages: messageTransfer.movedMessages, transferredSentMessages: messageTransfer.transferredSentMessages };
}

function findPendingMergeForPrimary(db, userId) {
  return (Array.isArray(db.accountMerges) ? db.accountMerges : []).find((merge) => merge.primaryUserId === userId && merge.status === 'pending');
}

app.post('/api/auth/register', async (req, res) => {
  const name = cleanText(req.body.name, 60);
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Navn, brugernavn og adgangskode er påkrævet.' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'Brugernavn skal være mindst 3 tegn.' });
  const passwordError = validateAccountPassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (rejectBlockedContent(res, name, 'Visningsnavn')) return;
  if (rejectBlockedContent(res, username, 'Brugernavn')) return;

  const registrationKey = lookupHash('username', username) || username;
  if (pendingUsernameRegistrations.has(registrationKey)) {
    return res.status(409).json({ error: 'Brugernavnet er allerede ved at blive oprettet. Prøv at logge ind.' });
  }

  pendingUsernameRegistrations.add(registrationKey);
  try {
    const initialDb = readDb();
    const alreadyTaken = initialDb.users.some((user) => userMatchesUsername(user, username));
    if (alreadyTaken) return res.status(409).json({ error: 'Brugernavnet er allerede i brug.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const db = readDb();
    const takenAfterHash = db.users.some((user) => userMatchesUsername(user, username));
    if (takenAfterHash) return res.status(409).json({ error: 'Brugernavnet er allerede i brug.' });

    const user = {
      id: id('usr'),
      ...encryptedUserIdentity({
        name,
        username,
        bio: 'Ny på TSN.'
      }),
      passwordHash,
      sessionVersion: 0,
      xp: 0,
      level: 1,
      loginStreak: 0,
      bestLoginStreak: 0,
      lastLoginDay: '',
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    await writeDb(db);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } finally {
    pendingUsernameRegistrations.delete(registrationKey);
  }
});

app.post('/api/auth/login', async (req, res) => {
  const login = req.body.username || req.body.login;
  const password = String(req.body.password || '');
  const db = readDb();

  const user = findUserByLogin(db.users, login);
  if (!user) {
    const hasEncryptedUsers = db.users.some((candidate) => candidate.usernameEnc || candidate.usernameHash);
    const hint = hasEncryptedUsers
      ? 'Forkert brugernavn eller adgangskode. Hvis dette startede lige efter en TSN-opdatering, skal du sikre dig, at den samme TSN_DATA_ENCRYPTION_KEY stadig er sat, eller tilføje den gamle nøgle til TSN_OLD_DATA_ENCRYPTION_KEYS.'
      : 'Forkert brugernavn eller adgangskode.';
    return res.status(401).json({ error: hint });
  }
  if (isBanned(user)) return res.status(403).json({ error: 'Denne konto er banned.' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Forkert brugernavn eller adgangskode.' });

  repairUserLookupHashIfNeeded(user, login);
  updateLoginStreak(db, user);
  await writeDb(db);

  res.json({ token: signToken(user), user: publicUser(user), recoveryMerge: pendingMergePublic(db, findPendingMergeForPrimary(db, user.id)) });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = req.db.users.find((candidate) => candidate.id === req.user.id);
  updateLoginStreak(req.db, user);
  await writeDb(req.db);
  res.json({ user: publicUser(user || req.user), recoveryMerge: pendingMergePublic(req.db, findPendingMergeForPrimary(req.db, (user || req.user).id)) });
});

app.get('/api/call-config', requireAuth, (req, res) => {
  res.json({
    iceServers: CALL_ICE_SERVERS,
    turnEnabled: CALL_TURN_ENABLED,
    mode: CALL_TURN_ENABLED ? 'stun-turn' : 'stun-only',
    note: CALL_TURN_ENABLED
      ? 'TURN er konfigureret. Opkald virker bedre på forskellige netværk og bag streng NAT.'
      : 'Public STUN er aktiv. Tilføj TSN_TURN_URLS, TSN_TURN_USERNAME og TSN_TURN_CREDENTIAL på Render for maksimal stabilitet på forskellige netværk.'
  });
});


app.get('/api/recovery/my-requests', requireAuth, (req, res) => {
  const requests = (req.db.recoveryRequests || [])
    .filter((request) => request.requesterId === req.user.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((request) => recoveryRequestPublic(req.db, request, req.user));
  res.json({ requests });
});

app.post('/api/recovery/request', requireAuth, async (req, res) => {
  const oldUsername = normalizeUsername(req.body.oldUsername || req.body.username || '');
  const note = cleanText(req.body.note || '', 300);
  if (!oldUsername) return res.status(400).json({ error: 'Skriv brugernavnet på den gamle konto.' });
  const db = req.db;
  const oldUser = db.users.find((user) => userMatchesUsername(user, oldUsername));
  if (!oldUser) return res.status(404).json({ error: 'Den gamle konto blev ikke fundet.' });
  if (oldUser.id === req.user.id) return res.status(400).json({ error: 'Du er allerede logget ind på den konto.' });
  const existing = (db.recoveryRequests || []).find((request) => request.oldUserId === oldUser.id && request.requesterId === req.user.id && ['pending', 'approved'].includes(request.status) && !request.usedAt);
  if (existing) return res.status(409).json({ error: 'Du har allerede en aktiv gendannelsesanmodning til den konto.' });
  const request = {
    id: id('recovery'),
    requesterId: req.user.id,
    oldUserId: oldUser.id,
    oldUsername,
    status: 'pending',
    ...encryptedTextObject('note', note),
    createdAt: new Date().toISOString()
  };
  db.recoveryRequests = Array.isArray(db.recoveryRequests) ? db.recoveryRequests : [];
  db.recoveryRequests.push(request);
  db.users.filter((user) => user.role === 'admin').forEach((admin) => {
    createNotification(db, admin.id, 'account-recovery', 'Ny anmodning om kontogendannelse', `${getUserField(req.user, 'name')} vil genoprette kontoen @${oldUsername}.`, { requestId: request.id, requesterId: req.user.id, oldUserId: oldUser.id });
  });
  await writeDb(db);
  res.status(201).json({ request: recoveryRequestPublic(db, request, req.user) });
});

app.post('/api/recovery/reset', async (req, res) => {
  const requestId = String(req.body.requestId || '').trim();
  const resetCode = String(req.body.resetCode || '').trim();
  const newPassword = String(req.body.newPassword || '');
  const passwordError = validateAccountPassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const db = readDb();
  const request = (db.recoveryRequests || []).find((candidate) => candidate.id === requestId);
  if (!request || request.status !== 'approved' || request.usedAt) return res.status(404).json({ error: 'Gendannelseskoden er ikke aktiv.' });
  if (!resetCode || !safeStringEqual(resetCode, request.resetCode || '')) return res.status(401).json({ error: 'Forkert gendannelseskode.' });
  const oldUser = db.users.find((user) => user.id === request.oldUserId);
  const requester = db.users.find((user) => user.id === request.requesterId);
  if (!oldUser || !requester) return res.status(404).json({ error: 'En af kontoerne blev ikke fundet.' });
  oldUser.passwordHash = await bcrypt.hash(newPassword, 12);
  oldUser.sessionVersion = Number(oldUser.sessionVersion || 0) + 1;
  request.usedAt = new Date().toISOString();
  request.status = 'used';
  db.accountMerges = Array.isArray(db.accountMerges) ? db.accountMerges : [];
  let merge = db.accountMerges.find((candidate) => candidate.requestId === request.id);
  if (!merge) {
    merge = {
      id: id('merge'),
      requestId: request.id,
      primaryUserId: oldUser.id,
      secondaryUserId: requester.id,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.accountMerges.push(merge);
  }
  createNotification(db, oldUser.id, 'account-recovery', 'Konto klar til sammenlægning', 'Log ind på den gamle konto for at gennemføre sammenlægningen.', { mergeId: merge.id });
  await writeDb(db);
  res.json({ ok: true, message: 'Adgangskoden er nulstillet sikkert. Log nu ind på den gamle konto for at sammenlægge kontiene.' });
});

app.get('/api/recovery/pending-merge', requireAuth, (req, res) => {
  res.json({ recoveryMerge: pendingMergePublic(req.db, findPendingMergeForPrimary(req.db, req.user.id)) });
});

app.post('/api/recovery/merge/confirm', requireAuth, async (req, res) => {
  const db = req.db;
  const merge = findPendingMergeForPrimary(db, req.user.id);
  if (!merge) return res.status(404).json({ error: 'Ingen kontosammenlægning venter.' });
  const result = mergeUserAccounts(db, merge);
  await writeDb(db);
  const payload = {
    primaryUser: publicUser(result.primary),
    secondaryUserId: result.secondary.id,
    secondaryUsername: getUserField(result.secondary, 'username'),
    movedMessages: result.movedMessages,
    transferredSentMessages: result.transferredSentMessages
  };
  uniqueStringArray([result.primary.id, ...(result.affectedUserIds || [])]).forEach((userId) => {
    io.to(userId).emit('account-merged', payload);
  });
  res.json({ ok: true, user: publicUser(result.primary), merge: pendingMergePublic(db, merge), movedMessages: result.movedMessages, transferredSentMessages: result.transferredSentMessages });
});

app.get('/api/admin/recovery-requests', requireAuth, requireAdmin, (req, res) => {
  const status = String(req.query.status || 'pending').toLowerCase();
  let requests = [...(req.db.recoveryRequests || [])];
  if (status !== 'all') requests = requests.filter((request) => (request.status || 'pending') === status);
  requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ requests: requests.map((request) => recoveryRequestPublic(req.db, request, req.user)) });
});

app.patch('/api/admin/recovery-requests/:requestId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const request = (db.recoveryRequests || []).find((candidate) => candidate.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Gendannelsesanmodningen blev ikke fundet.' });
  if (request.usedAt) return res.status(400).json({ error: 'Denne gendannelsesanmodning er allerede brugt.' });
  const action = String(req.body.action || '').toLowerCase();
  const adminNote = cleanText(req.body.adminNote || '', 300);
  if (action === 'approve') {
    request.status = 'approved';
    request.resetCode = generateRecoveryCode();
    request.reviewedAt = new Date().toISOString();
    request.reviewedBy = req.user.id;
    Object.assign(request, encryptedTextObject('adminNote', adminNote));
    createNotification(db, request.requesterId, 'account-recovery', 'Gendannelse godkendt', 'Din gendannelseskode er klar under Profil → Kontogendannelse.', { requestId: request.id });
  } else if (action === 'deny' || action === 'reject') {
    request.status = 'denied';
    request.reviewedAt = new Date().toISOString();
    request.reviewedBy = req.user.id;
    Object.assign(request, encryptedTextObject('adminNote', adminNote));
    createNotification(db, request.requesterId, 'account-recovery', 'Gendannelse afvist', adminNote || 'Admin afviste din gendannelsesanmodning.', { requestId: request.id });
  } else {
    return res.status(400).json({ error: 'Ugyldig handling. Brug godkend eller afvis.' });
  }
  await writeDb(db);
  res.json({ request: recoveryRequestPublic(db, request, req.user) });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  const name = cleanText(req.body.name, 60);
  const bio = cleanText(req.body.bio, 220);
  const status = cleanText(req.body.statusText ?? req.body.status, 80);
  const banner = cleanText(req.body.banner, 120);

  if (name && rejectBlockedContent(res, name, 'Visningsnavn')) return;
  if (bio && rejectBlockedContent(res, bio, 'Bio')) return;
  if (status && rejectBlockedContent(res, status, 'Status')) return;
  if (banner && rejectBlockedContent(res, banner, 'Profilbanner')) return;

  if (name) setEncryptedUserField(user, 'name', name);
  setEncryptedUserField(user, 'bio', bio);
  setEncryptedUserField(user, 'status', status);
  setEncryptedUserField(user, 'banner', banner);
  await writeDb(db);
  res.json({ user: publicUser(user) });
});

app.delete('/api/me', requireAuth, async (req, res) => {
  const password = String(req.body.password || '');
  if (!password) return res.status(400).json({ error: 'Skriv din adgangskode for at slette kontoen.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Kontoen blev ikke fundet.', logout: true });

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) return res.status(401).json({ error: 'Forkert adgangskode.' });

  const deletedUserId = user.id;
  const result = deleteUserDataFromDatabase(db, deletedUserId);
  await writeDb(db);

  forceLogoutUser(deletedUserId, 'Din konto er slettet.');
  io.emit('global-message-deleted', { messageId: '__reload__' });
  res.json({ ok: true, deleted: result, logout: true, message: 'Kontoen er slettet.' });
});

app.post('/api/admin/claim', requireAuth, async (req, res) => {
  const password = String(req.body.password || '');
  const ok = password ? await verifyAdminSetupPassword(password) : false;
  if (!ok) return res.status(401).json({ error: 'Forkert admin-setup-adgangskode.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(401).json({ error: 'Kontoen blev ikke fundet.' });

  user.role = 'admin';
  user.adminEnabledAt = new Date().toISOString();
  await writeDb(db);

  res.json({ user: publicUser(user) });
});

app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  res.json({ stats: buildAdminStats(req.db) });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  const status = cleanText(req.query.status || 'all', 24);
  let users = req.db.users.map((user) => publicModerationUser(user, req.db)).filter(Boolean);

  if (q) {
    users = users.filter((user) => [user.name, user.username, user.bio, user.banReason].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  if (status === 'online') users = users.filter((user) => user.online);
  if (status === 'banned') users = users.filter((user) => user.banned);
  if (status === 'muted') users = users.filter((user) => user.muted);
  if (status === 'admins') users = users.filter((user) => user.isAdmin);
  if (status === 'reported') users = users.filter((user) => Number(user.stats?.openReportsAgainstCount || 0) > 0);
  if (status === 'warned') users = users.filter((user) => Number(user.warningCount || 0) > 0);

  users.sort((a, b) => Number(b.online) - Number(a.online) || Number(Boolean(b.banned)) - Number(Boolean(a.banned)) || Number(b.stats?.openReportsAgainstCount || 0) - Number(a.stats?.openReportsAgainstCount || 0) || a.name.localeCompare(b.name));

  res.json({ users, count: users.length, stats: buildAdminStats(req.db) });
});


app.get('/api/admin/messages', requireAuth, requireAdmin, (req, res) => {
  const type = cleanText(req.query.type || 'all', 32);
  const q = cleanText(req.query.q || '', 120).toLowerCase();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const requestedOffset = Number.parseInt(req.query.offset, 10);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 60, 10), 120);
  const offset = Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0);

  let items = buildAdminMessageArchive(req.db);

  if (type === 'global') {
    items = items.filter((item) => item.kind === 'global-message' || item.kind === 'global-comment');
  } else if (type === 'direct' || type === 'verified-ai') {
    items = items.filter((item) => item.kind === 'direct-message' && item.verifiedAiEvidence);
  }

  if (q) {
    items = items.filter((item) => item.searchText.includes(q));
  }

  const totalCount = items.length;
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;

  res.json({
    items: pageItems.map(publicAdminMessageItem),
    count: pageItems.length,
    totalCount,
    privateMessagesCount: Array.isArray(req.db.messages) ? req.db.messages.length : 0,
    limit,
    offset,
    nextOffset,
    hasMore: nextOffset < totalCount,
    generatedAt: new Date().toISOString(),
    notice: 'Admins kan se globale beskeder og private beskeder sendt af brugere med badge-navnet Verified AI. Andre private beskeder er stadig skjult; kun antal vises.'
  });
});

app.get('/api/admin/reports', requireAuth, requireAdmin, (req, res) => {
  const status = cleanText(req.query.status || 'open', 24);
  const type = cleanText(req.query.type || 'all', 32);
  const q = cleanText(req.query.q || '', 120).toLowerCase();
  let reports = Array.isArray(req.db.reports) ? [...req.db.reports] : [];
  if (status !== 'all') reports = reports.filter((report) => (report.status || 'open') === status);
  if (type !== 'all') reports = reports.filter((report) => report.type === type);

  let publicReports = reports.map((report) => publicReport(req.db, report));
  if (q) {
    publicReports = publicReports.filter((report) => [
      report.reason,
      report.reporter?.name,
      report.reporter?.username,
      report.target?.body,
      report.target?.contextBody,
      report.target?.author?.name,
      report.target?.author?.username,
      report.target?.toUser?.name,
      report.target?.toUser?.username,
      report.target?.label
    ].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  publicReports.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ reports: publicReports, count: publicReports.length, stats: buildAdminStats(req.db) });
});

app.patch('/api/admin/reports/:reportId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const report = (Array.isArray(db.reports) ? db.reports : []).find((candidate) => candidate.id === req.params.reportId);
  if (!report) return res.status(404).json({ error: 'Rapporten blev ikke fundet.' });

  const action = cleanText(req.body.action || 'resolve', 24);
  if (action === 'reopen') {
    report.status = 'open';
    delete report.resolvedAt;
    delete report.resolvedBy;
  } else {
    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = req.user.id;
  }

  await writeDb(db);
  res.json({ ok: true, report: publicReport(db, report) });
});

app.delete('/api/admin/reports/:reportId/target', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const report = (Array.isArray(db.reports) ? db.reports : []).find((candidate) => candidate.id === req.params.reportId);
  if (!report) return res.status(404).json({ error: 'Rapporten blev ikke fundet.' });

  let deleted = null;
  if (report.type === 'global-message') {
    deleted = removeGlobalMessageById(db, report.messageId);
    if (!deleted) return res.status(404).json({ error: 'Chatbeskeden findes ikke længere.' });
  } else if (report.type === 'global-comment') {
    deleted = removeGlobalCommentById(db, report.messageId, report.commentId);
    if (!deleted) return res.status(404).json({ error: 'Kommentaren findes ikke længere.' });
  } else if (report.type === 'direct-message') {
    deleted = removeDirectMessageById(db, report.messageId);
    if (!deleted) return res.status(404).json({ error: 'Beskeden findes ikke længere.' });
  } else if (report.type === 'user') {
    const target = db.users.find((candidate) => candidate.id === report.targetUserId);
    if (!target) return res.status(404).json({ error: 'Brugeren findes ikke længere.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke banne dig selv via en rapport.' });
    if (target.role === 'admin') return res.status(403).json({ error: 'Du kan ikke banne en admin-konto via en rapport.' });
    target.bannedAt = new Date().toISOString();
    target.bannedBy = req.user.id;
    target.banReason = `Banned via rapport: ${getReportReason(report)}`.slice(0, 220);
    target.sessionVersion = getSessionVersion(target) + 1;
    deleted = target;
  } else {
    return res.status(400).json({ error: 'Rapporttypen understøttes ikke.' });
  }

  report.status = 'resolved';
  report.resolvedAt = new Date().toISOString();
  report.resolvedBy = req.user.id;
  await writeDb(db);

  if (report.type === 'global-message') io.emit('global-message-deleted', { messageId: report.messageId });
  if (report.type === 'global-comment' && deleted.message) emitGlobalMessageUpdated(db, deleted.message);
  if (report.type === 'direct-message') io.to(deleted.from).to(deleted.to).emit('message-deleted', { messageId: deleted.id, conversationId: deleted.conversationId });
  if (report.type === 'user') forceLogoutUser(deleted.id, deleted.banReason || 'Din konto blev banned af en admin.');

  res.json({ ok: true, report: publicReport(db, report) });
});


app.post('/api/admin/users/:userId/mute', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke mute dig selv.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Du kan ikke mute en anden admin-konto.' });

  const durationMinutes = clampInteger(req.body.durationMinutes || DEFAULT_ADMIN_MUTE_MINUTES, 1, 1440);
  const reason = cleanText(req.body.reason || 'Muted af admin', 220);
  if (reason && rejectBlockedContent(res, reason, 'Mute-grund')) return;

  target.mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  target.mutedBy = req.user.id;
  target.muteReason = reason;
  await writeDb(db);

  io.to(target.id).emit('profile-updated', { user: publicUser(target) });
  res.json({ ok: true, user: publicModerationUser(target, db), stats: buildAdminStats(db) });
});

app.post('/api/admin/users/:userId/unmute', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  delete target.mutedUntil;
  delete target.mutedBy;
  delete target.muteReason;
  target.spamWarnings = 0;
  await writeDb(db);

  io.to(target.id).emit('profile-updated', { user: publicUser(target) });
  res.json({ ok: true, user: publicModerationUser(target, db), stats: buildAdminStats(db) });
});

app.put('/api/admin/users/:userId/badges', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((user) => user.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  const rawBadges = Array.isArray(req.body.badges)
    ? req.body.badges
    : String(req.body.badges || '').split(',');
  const customBadges = normalizeCustomBadges(rawBadges);
  const blockedBadge = customBadges.find((label) => contentFilterError(label, 'Badge'));
  if (blockedBadge) return res.status(400).json({ error: contentFilterError(blockedBadge, 'Badge') });

  target.customBadges = customBadges;
  await writeDb(db);

  emitUserProfileUpdated(target);
  io.to(target.id).emit('profile-updated', { user: publicUser(target) });
  res.json({ ok: true, user: publicModerationUser(target, db), stats: buildAdminStats(db) });
});

app.post('/api/admin/users/:userId/warn', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((user) => user.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.role === 'admin' && target.id !== req.user.id) return res.status(403).json({ error: 'Du kan ikke advare en anden admin her.' });
  const reason = cleanText(req.body.reason, 300) || 'Regelbrud';
  if (rejectBlockedContent(res, reason, 'Advarselsgrund')) return;

  target.warningCount = Math.max(0, Number(target.warningCount) || 0) + 1;
  target.latestWarningAt = new Date().toISOString();
  target.latestWarningReason = reason;
  db.warnings = Array.isArray(db.warnings) ? db.warnings : [];
  const warning = {
    id: id('warn'),
    userId: target.id,
    issuedBy: req.user.id,
    ...encryptedTextObject('reason', reason),
    createdAt: target.latestWarningAt
  };
  db.warnings.push(warning);
  if (db.warnings.length > WARNINGS_LIMIT) db.warnings = db.warnings.slice(-WARNINGS_LIMIT);
  createNotification(db, target.id, 'warning', 'Du har fået en TSN-advarsel', reason, { warningId: warning.id });
  await writeDb(db);
  io.to(target.id).emit('user-profile-updated', publicUser(target));
  res.json({ ok: true, user: publicModerationUser(target, db), stats: buildAdminStats(db) });
});


app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke slette din egen admin-konto her.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Du kan ikke slette en anden admin-konto.' });

  const result = deleteUserDataFromDatabase(db, target.id);
  await writeDb(db);

  forceLogoutUser(target.id, 'Din konto blev slettet af en admin.');
  io.emit('global-message-deleted', { messageId: '__reload__' });
  res.json({ ok: true, deleted: result, stats: buildAdminStats(db) });
});

app.post('/api/admin/users/:userId/kick', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke smide dig selv ud.' });

  target.sessionVersion = getSessionVersion(target) + 1;
  target.kickedAt = new Date().toISOString();
  target.kickedBy = req.user.id;
  await writeDb(db);

  forceLogoutUser(target.id, 'Du blev smidt ud af en admin.');
  res.json({ ok: true, user: publicModerationUser(target) });
});

app.post('/api/admin/users/:userId/ban', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke banne dig selv.' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Du kan ikke banne en anden admin-konto.' });

  const reason = cleanText(req.body.reason, 200);
  if (reason && rejectBlockedContent(res, reason, 'Ban-grund')) return;

  target.bannedAt = new Date().toISOString();
  target.bannedBy = req.user.id;
  target.banReason = reason;
  target.sessionVersion = getSessionVersion(target) + 1;
  await writeDb(db);

  forceLogoutUser(target.id, target.banReason ? `Din konto blev banned: ${target.banReason}` : 'Din konto blev banned af en admin.');
  res.json({ ok: true, user: publicModerationUser(target) });
});

app.post('/api/admin/users/:userId/unban', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db;
  const target = db.users.find((candidate) => candidate.id === req.params.userId);
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  delete target.bannedAt;
  delete target.bannedBy;
  delete target.banReason;
  await writeDb(db);

  res.json({ ok: true, user: publicModerationUser(target) });
});

app.get('/api/users', requireAuth, (req, res) => {
  const q = cleanText(req.query.q || '', 80).toLowerCase();
  const seenUserKeys = new Set();
  const ownDuplicateKey = duplicateUserKey(req.user);
  if (ownDuplicateKey) seenUserKeys.add(ownDuplicateKey);
  const users = req.db.users
    .filter((user) => user.id !== req.user.id && !isBanned(user))
    .filter((user) => {
      const key = duplicateUserKey(user) || `id:${user.id}`;
      if (seenUserKeys.has(key)) return false;
      seenUserKeys.add(key);
      return true;
    })
    .map((user) => ({
      ...publicUserForViewer(user, req.user),
      online: onlineUsers.has(user.id),
      unreadCount: getUnreadMessageCount(req.db, req.user.id, user.id)
    }))
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.username.toLowerCase().includes(q) || String(user.bio || '').toLowerCase().includes(q))
    .sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  res.json({ users });
});


app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = (Array.isArray(req.db.notifications) ? req.db.notifications : [])
    .filter((notification) => notification.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 80)
    .map(publicNotification);
  res.json({ notifications, unreadCount: notifications.filter((notification) => !notification.read).length });
});

app.post('/api/notifications/:notificationId/read', requireAuth, async (req, res) => {
  const db = req.db;
  const notification = (Array.isArray(db.notifications) ? db.notifications : []).find((candidate) => candidate.id === req.params.notificationId && candidate.userId === req.user.id);
  if (!notification) return res.status(404).json({ error: 'Notifikationen blev ikke fundet.' });
  notification.read = true;
  notification.readAt = new Date().toISOString();
  await writeDb(db);
  res.json({ ok: true, notification: publicNotification(notification) });
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  const db = req.db;
  let changed = 0;
  (Array.isArray(db.notifications) ? db.notifications : []).forEach((notification) => {
    if (notification.userId === req.user.id && !notification.read) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
      changed += 1;
    }
  });
  await writeDb(db);
  res.json({ ok: true, changed });
});

app.get('/api/friends', requireAuth, (req, res) => {
  const find = (userId) => req.db.users.find((user) => user.id === userId && !isBanned(user));
  const friends = uniqueStringArray(req.user.friends).map(find).filter(Boolean).map((user) => ({ ...publicUserForViewer(user, req.user), online: onlineUsers.has(user.id), unreadCount: getUnreadMessageCount(req.db, req.user.id, user.id) }));
  const incoming = uniqueStringArray(req.user.friendRequestsIn).map(find).filter(Boolean).map((user) => ({ ...publicUserForViewer(user, req.user), online: onlineUsers.has(user.id) }));
  const outgoing = uniqueStringArray(req.user.friendRequestsOut).map(find).filter(Boolean).map((user) => ({ ...publicUserForViewer(user, req.user), online: onlineUsers.has(user.id) }));
  res.json({ friends, incoming, outgoing });
});

app.post('/api/friends/:userId/request', requireAuth, async (req, res) => {
  const db = req.db;
  const me = db.users.find((user) => user.id === req.user.id);
  const target = db.users.find((user) => user.id === req.params.userId && !isBanned(user));
  if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  if (target.id === me.id) return res.status(400).json({ error: 'Du kan ikke sende en venneanmodning til dig selv.' });
  me.friends = uniqueStringArray(me.friends);
  target.friends = uniqueStringArray(target.friends);
  me.friendRequestsIn = uniqueStringArray(me.friendRequestsIn);
  me.friendRequestsOut = uniqueStringArray(me.friendRequestsOut);
  target.friendRequestsIn = uniqueStringArray(target.friendRequestsIn);
  target.friendRequestsOut = uniqueStringArray(target.friendRequestsOut);
  if (me.friends.includes(target.id)) return res.json({ ok: true, status: 'friends' });

  if (me.friendRequestsIn.includes(target.id)) {
    me.friendRequestsIn = me.friendRequestsIn.filter((idValue) => idValue !== target.id);
    target.friendRequestsOut = target.friendRequestsOut.filter((idValue) => idValue !== me.id);
    me.friends.push(target.id);
    target.friends.push(me.id);
    createNotification(db, target.id, 'friend-accepted', `${getUserField(me, 'name')} accepterede dig`, 'I er nu venner på TSN.', { userId: me.id });
    awardXp(db, me.id, XP_FRIEND_ACCEPTED, 'ny ven', { friendId: target.id });
    awardXp(db, target.id, XP_FRIEND_ACCEPTED, 'ny ven', { friendId: me.id });
    addActivity(db, 'friend', `${getUserField(me, 'name')} og ${getUserField(target, 'name')} blev venner`, '', me.id, { friendId: target.id });
    await writeDb(db);
    io.to(target.id).emit('user-profile-updated', publicUserForViewer(me, target));
    return res.json({ ok: true, status: 'friends', user: publicUserForViewer(target, me) });
  }

  if (!me.friendRequestsOut.includes(target.id)) me.friendRequestsOut.push(target.id);
  if (!target.friendRequestsIn.includes(me.id)) target.friendRequestsIn.push(me.id);
  createNotification(db, target.id, 'friend-request', `${getUserField(me, 'name')} sendte en venneanmodning`, 'Åbn Venner for at acceptere eller afvise.', { userId: me.id });
  await writeDb(db);
  io.to(target.id).emit('user-profile-updated', publicUserForViewer(me, target));
  res.status(201).json({ ok: true, status: 'pending-out', user: publicUserForViewer(target, me) });
});

app.post('/api/friends/:userId/accept', requireAuth, async (req, res) => {
  const db = req.db;
  const me = db.users.find((user) => user.id === req.user.id);
  const other = db.users.find((user) => user.id === req.params.userId && !isBanned(user));
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  me.friendRequestsIn = uniqueStringArray(me.friendRequestsIn).filter((idValue) => idValue !== other.id);
  other.friendRequestsOut = uniqueStringArray(other.friendRequestsOut).filter((idValue) => idValue !== me.id);
  me.friends = uniqueStringArray([...me.friends, other.id]);
  other.friends = uniqueStringArray([...other.friends, me.id]);
  createNotification(db, other.id, 'friend-accepted', `${getUserField(me, 'name')} accepterede dig`, 'I er nu venner på TSN.', { userId: me.id });
  awardXp(db, me.id, XP_FRIEND_ACCEPTED, 'ny ven', { friendId: other.id });
  awardXp(db, other.id, XP_FRIEND_ACCEPTED, 'ny ven', { friendId: me.id });
  addActivity(db, 'friend', `${getUserField(me, 'name')} og ${getUserField(other, 'name')} blev venner`, '', me.id, { friendId: other.id });
  await writeDb(db);
  io.to(other.id).emit('user-profile-updated', publicUserForViewer(me, other));
  res.json({ ok: true, status: 'friends', user: publicUserForViewer(other, me) });
});

app.post('/api/friends/:userId/decline', requireAuth, async (req, res) => {
  const db = req.db;
  const me = db.users.find((user) => user.id === req.user.id);
  const other = db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  me.friendRequestsIn = uniqueStringArray(me.friendRequestsIn).filter((idValue) => idValue !== other.id);
  me.friendRequestsOut = uniqueStringArray(me.friendRequestsOut).filter((idValue) => idValue !== other.id);
  other.friendRequestsIn = uniqueStringArray(other.friendRequestsIn).filter((idValue) => idValue !== me.id);
  other.friendRequestsOut = uniqueStringArray(other.friendRequestsOut).filter((idValue) => idValue !== me.id);
  await writeDb(db);
  res.json({ ok: true, status: 'none' });
});

app.delete('/api/friends/:userId', requireAuth, async (req, res) => {
  const db = req.db;
  const me = db.users.find((user) => user.id === req.user.id);
  const other = db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
  me.friends = uniqueStringArray(me.friends).filter((idValue) => idValue !== other.id);
  other.friends = uniqueStringArray(other.friends).filter((idValue) => idValue !== me.id);
  me.friendRequestsIn = uniqueStringArray(me.friendRequestsIn).filter((idValue) => idValue !== other.id);
  me.friendRequestsOut = uniqueStringArray(me.friendRequestsOut).filter((idValue) => idValue !== other.id);
  other.friendRequestsIn = uniqueStringArray(other.friendRequestsIn).filter((idValue) => idValue !== me.id);
  other.friendRequestsOut = uniqueStringArray(other.friendRequestsOut).filter((idValue) => idValue !== me.id);
  await writeDb(db);
  res.json({ ok: true, status: 'none' });
});


app.get('/api/public/stock', (req, res) => {
  const db = readDb();
  const snapshot = getTsnStockSnapshot(db, { persist: false, reason: 'public-view' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ stock: snapshot });
});


app.get('/api/home', requireAuth, (req, res) => {
  const stock = getTsnStockSnapshot(req.db, { persist: false, reason: 'home-widget' });
  const activeEvent = [...(Array.isArray(req.db.events) ? req.db.events : [])].filter((event) => (event.status || 'open') === 'open').sort((a, b) => new Date(a.startsAt || a.createdAt || 0) - new Date(b.startsAt || b.createdAt || 0))[0] || null;
  const activePoll = [...(Array.isArray(req.db.polls) ? req.db.polls : [])].filter((poll) => (poll.status || 'open') === 'open').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  res.json({ user: publicUser(req.user), stock, activeEvent: activeEvent ? publicEvent(activeEvent, req.user.id) : null, activePoll: activePoll ? publicPoll(activePoll, req.user.id) : null, activity: [...(Array.isArray(req.db.activityFeed) ? req.db.activityFeed : [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 20).map((item) => activityItemPublic(item, req.db.users)), leaderboard: buildLeaderboard(req.db).slice(0, 5) });
});

app.get('/api/leaderboard', requireAuth, (req, res) => res.json({ leaderboard: buildLeaderboard(req.db) }));

app.get('/api/events', requireAuth, (req, res) => {
  const events = [...(Array.isArray(req.db.events) ? req.db.events : [])].sort((a, b) => new Date(a.startsAt || a.createdAt || 0) - new Date(b.startsAt || b.createdAt || 0)).map((event) => publicEvent(event, req.user.id));
  res.json({ events });
});

app.post('/api/events', requireAuth, requireAdmin, async (req, res) => {
  const title = cleanText(req.body.title, 90); const description = cleanText(req.body.description, 260); const startsAt = cleanText(req.body.startsAt, 40);
  if (!title) return res.status(400).json({ error: 'Eventtitel er påkrævet.' });
  if (rejectBlockedContent(res, title, 'Eventtitel')) return;
  if (description && rejectBlockedContent(res, description, 'Eventbeskrivelse')) return;
  const db = req.db; db.events = Array.isArray(db.events) ? db.events : [];
  const event = { id: id('event'), ...encryptedTextObject('title', title), ...encryptedTextObject('description', description), startsAt: startsAt || null, status: 'open', participants: [], createdBy: req.user.id, createdAt: new Date().toISOString() };
  db.events.push(event); if (db.events.length > EVENTS_LIMIT) db.events = db.events.slice(-EVENTS_LIMIT);
  addActivity(db, 'event', `Nyt TSN-event: ${title}`, description, req.user.id, { eventId: event.id });
  await writeDb(db); io.emit('growth-updated', { type: 'event' }); res.status(201).json({ event: publicEvent(event, req.user.id) });
});

app.post('/api/events/:eventId/join', requireAuth, async (req, res) => {
  const db = req.db; const event = (Array.isArray(db.events) ? db.events : []).find((candidate) => candidate.id === req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Eventet blev ikke fundet.' });
  if ((event.status || 'open') !== 'open') return res.status(400).json({ error: 'Eventet er lukket.' });
  event.participants = uniqueStringArray(event.participants); const joined = !event.participants.includes(req.user.id);
  if (joined) { event.participants.push(req.user.id); awardXp(db, req.user.id, XP_EVENT_JOIN, 'event deltagelse', { eventId: event.id }); }
  await writeDb(db); io.emit('growth-updated', { type: 'event-join' }); res.json({ ok: true, joined, event: publicEvent(event, req.user.id) });
});

app.patch('/api/events/:eventId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db; const event = (Array.isArray(db.events) ? db.events : []).find((candidate) => candidate.id === req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Eventet blev ikke fundet.' });
  const status = cleanText(req.body.status, 20); if (status && ['open', 'closed'].includes(status)) event.status = status;
  await writeDb(db); res.json({ event: publicEvent(event, req.user.id) });
});

app.get('/api/polls', requireAuth, (req, res) => {
  const polls = [...(Array.isArray(req.db.polls) ? req.db.polls : [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).map((poll) => publicPoll(poll, req.user.id));
  res.json({ polls });
});

app.post('/api/polls', requireAuth, requireAdmin, async (req, res) => {
  const question = cleanText(req.body.question, 140); const options = (Array.isArray(req.body.options) ? req.body.options : []).map((option) => cleanText(option, 70)).filter(Boolean).slice(0, 6);
  if (!question) return res.status(400).json({ error: 'Afstemningsspørgsmål er påkrævet.' });
  if (options.length < 2) return res.status(400).json({ error: 'Lav mindst 2 svarmuligheder.' });
  if (rejectBlockedContent(res, question, 'Afstemningsspørgsmål')) return;
  for (const option of options) { const error = contentFilterError(option, 'Afstemningssvar'); if (error) return res.status(400).json({ error }); }
  const db = req.db; db.polls = Array.isArray(db.polls) ? db.polls : [];
  const poll = { id: id('poll'), ...encryptedTextObject('question', question), options: options.map((option, index) => ({ id: `o${index + 1}`, ...encryptedTextObject('text', option) })), votes: {}, status: 'open', createdBy: req.user.id, createdAt: new Date().toISOString() };
  db.polls.push(poll); if (db.polls.length > POLLS_LIMIT) db.polls = db.polls.slice(-POLLS_LIMIT);
  addActivity(db, 'poll', `Ny afstemning: ${question}`, options.join(' · '), req.user.id, { pollId: poll.id });
  await writeDb(db); io.emit('growth-updated', { type: 'poll' }); res.status(201).json({ poll: publicPoll(poll, req.user.id) });
});

app.post('/api/polls/:pollId/vote', requireAuth, async (req, res) => {
  const optionId = cleanText(req.body.optionId, 20); const db = req.db; const poll = (Array.isArray(db.polls) ? db.polls : []).find((candidate) => candidate.id === req.params.pollId);
  if (!poll) return res.status(404).json({ error: 'Afstemningen blev ikke fundet.' });
  if ((poll.status || 'open') !== 'open') return res.status(400).json({ error: 'Afstemningen er lukket.' });
  const optionExists = (Array.isArray(poll.options) ? poll.options : []).some((option) => String(option.id) === optionId);
  if (!optionExists) return res.status(400).json({ error: 'Svarmuligheden blev ikke fundet.' });
  poll.votes = poll.votes && typeof poll.votes === 'object' ? poll.votes : {}; const firstVote = !poll.votes[req.user.id]; poll.votes[req.user.id] = optionId;
  if (firstVote) awardXp(db, req.user.id, XP_POLL_VOTE, 'afstemning', { pollId: poll.id });
  await writeDb(db); io.emit('growth-updated', { type: 'poll-vote' }); res.json({ ok: true, poll: publicPoll(poll, req.user.id) });
});

app.patch('/api/polls/:pollId', requireAuth, requireAdmin, async (req, res) => {
  const db = req.db; const poll = (Array.isArray(db.polls) ? db.polls : []).find((candidate) => candidate.id === req.params.pollId);
  if (!poll) return res.status(404).json({ error: 'Afstemningen blev ikke fundet.' });
  const status = cleanText(req.body.status, 20); if (status && ['open', 'closed'].includes(status)) poll.status = status;
  await writeDb(db); res.json({ poll: publicPoll(poll, req.user.id) });
});

app.get('/api/media-library', requireAuth, (req, res) => {
  res.json({
    items: [],
    mode: 'web-search-only',
    webSearchEnabled: MEDIA_WEB_SEARCH_ENABLED,
    webProviders: MEDIA_WEB_PROVIDERS.filter((provider) => (provider === 'giphy' && GIPHY_API_KEY) || (provider === 'pixabay' && PIXABAY_API_KEY))
  });
});

app.get('/api/media-search', requireAuth, async (req, res) => {
  try {
    const result = await searchWebMedia({
      query: req.query.q || req.query.query || '',
      kind: req.query.kind || req.query.type || 'all',
      limit: Number(req.query.limit) || MEDIA_WEB_SEARCH_LIMIT
    });
    res.json({
      ...result,
      items: result.items.map(publicSafeMediaItem),
      cacheTtlMs: MEDIA_WEB_CACHE_TTL_MS
    });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Kunne ikke søge efter medier fra websitet.' });
  }
});

app.get('/api/stock', requireAuth, (req, res) => {
  const snapshot = getTsnStockSnapshot(req.db, { persist: false, reason: 'view' });
  res.json({ stock: snapshot });
});

app.get('/api/global/messages', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const messages = [...(req.db.globalMessages || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => attachGlobalMessagePeople(message, req.db.users, req.user.id));

  res.json({ messages });
});

app.post('/api/global/messages', requireAuth, async (req, res) => {
  const text = cleanText(req.body.text || req.body.body, 600);
  let attachment = null;
  try {
    attachment = normalizeImageAttachment(req.body.attachment || req.body.image || null);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!text && !attachment) return res.status(400).json({ error: 'Global chatbesked skal have tekst eller billede.' });
  if (text && rejectBlockedContent(res, text, 'Global chatbesked')) return;

  const db = req.db;
  const spamError = applyChatAntiSpam(db, req.user, text || '[billede]', 'global-chat');
  if (spamError) {
    await writeDb(db);
    return res.status(429).json({ error: spamError, mutedUntil: req.user.mutedUntil || null });
  }

  const message = {
    id: id('globalmsg'),
    authorId: req.user.id,
    likes: [],
    comments: [],
    ...encryptedTextObject('text', text),
    createdAt: new Date().toISOString()
  };
  setMessageAttachment(message, attachment);

  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  db.globalMessages.push(message);
  if (text) notifyMentions(db, text, req.user, { type: 'global-message', messageId: message.id });
  awardXp(db, req.user.id, XP_GLOBAL_MESSAGE, 'global chat', { messageId: message.id });
  addActivity(db, 'global-chat', `${getUserField(req.user, 'name')} skrev i global chat`, text.slice(0, 140), req.user.id, { messageId: message.id });
  if (db.globalMessages.length > 1000) {
    db.globalMessages = db.globalMessages.slice(-1000);
  }

  await writeDb(db);

  emitGlobalMessageUpdated(db, message);
  broadcastTsnStock(readDb(), 'global-chat').catch((error) => console.warn(`TSN Stock update failed: ${error.message}`));
  res.status(201).json({ message: attachGlobalMessagePeople(message, db.users, req.user.id) });
});

app.post('/api/global/messages/:messageId/like', requireAuth, async (req, res) => {
  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Global chatbesked blev ikke fundet.' });

  normalizeGlobalMessageInteractions(message);
  const existingIndex = message.likes.indexOf(req.user.id);
  const liked = existingIndex < 0;
  if (liked) {
    message.likes.push(req.user.id);
  } else {
    message.likes.splice(existingIndex, 1);
  }

  await writeDb(db);
  emitGlobalMessageUpdated(db, message);
  res.json({ ok: true, liked, message: attachGlobalMessagePeople(message, db.users, req.user.id) });
});

app.post('/api/global/messages/:messageId/reactions', requireAuth, async (req, res) => {
  const emoji = String(req.body.emoji || '').trim();
  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Global chatbesked blev ikke fundet.' });

  let reacted;
  try {
    reacted = toggleReactionOnItem(message, req.user.id, emoji);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (reacted && message.authorId && message.authorId !== req.user.id) {
    createNotification(db, message.authorId, 'reaction', `${getUserField(req.user, 'name')} reagerede på din besked`, `${emoji} på din globale chatbesked`, { type: 'global-message', messageId: message.id });
    awardXp(db, message.authorId, XP_REACTION_RECEIVED, 'reaktion modtaget', { messageId: message.id, emoji });
  }

  await writeDb(db);
  emitGlobalMessageUpdated(db, message);
  res.json({ ok: true, reacted, message: attachGlobalMessagePeople(message, db.users, req.user.id) });
});

app.post('/api/global/messages/:messageId/comments', requireAuth, async (req, res) => {
  const text = cleanText(req.body.text || req.body.body, 400);
  if (!text) return res.status(400).json({ error: 'Kommentar må ikke være tom.' });
  if (rejectBlockedContent(res, text, 'Kommentar')) return;

  const db = req.db;
  const spamError = applyChatAntiSpam(db, req.user, text, 'global-comment');
  if (spamError) {
    await writeDb(db);
    return res.status(429).json({ error: spamError, mutedUntil: req.user.mutedUntil || null });
  }
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Global chatbesked blev ikke fundet.' });

  normalizeGlobalMessageInteractions(message);
  const comment = {
    id: id('gcomment'),
    authorId: req.user.id,
    ...encryptedTextObject('text', text),
    createdAt: new Date().toISOString()
  };

  message.comments.push(comment);
  notifyMentions(db, text, req.user, { type: 'global-comment', messageId: message.id, commentId: comment.id });
  awardXp(db, req.user.id, Math.max(1, Math.floor(XP_GLOBAL_MESSAGE / 2)), 'global kommentar', { messageId: message.id, commentId: comment.id });
  if (message.comments.length > 200) {
    message.comments = message.comments.slice(-200);
  }

  await writeDb(db);
  emitGlobalMessageUpdated(db, message);
  broadcastTsnStock(readDb(), 'global-comment').catch((error) => console.warn(`TSN Stock update failed: ${error.message}`));
  res.status(201).json({ comment: publicGlobalComment(comment, db.users), message: attachGlobalMessagePeople(message, db.users, req.user.id) });
});

app.delete('/api/global/messages/:messageId/comments/:commentId', requireAuth, async (req, res) => {
  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Global chatbesked blev ikke fundet.' });

  normalizeGlobalMessageInteractions(message);
  const index = message.comments.findIndex((candidate) => candidate.id === req.params.commentId);
  if (index < 0) return res.status(404).json({ error: 'Kommentaren blev ikke fundet.' });

  const comment = message.comments[index];
  if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
    return res.status(403).json({ error: 'Du kan kun slette dine egne kommentarer, medmindre du er admin.' });
  }

  const [deleted] = message.comments.splice(index, 1);
  await writeDb(db);
  emitGlobalMessageUpdated(db, message);
  res.json({ ok: true, messageId: message.id, commentId: deleted.id });
});

app.delete('/api/global/messages/:messageId', requireAuth, async (req, res) => {
  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const index = db.globalMessages.findIndex((candidate) => candidate.id === req.params.messageId);
  if (index < 0) return res.status(404).json({ error: 'Global besked blev ikke fundet.' });

  const message = db.globalMessages[index];
  if (req.user.role !== 'admin' && message.authorId !== req.user.id) {
    return res.status(403).json({ error: 'Du kan kun slette dine egne globale chatbeskeder, medmindre du er admin.' });
  }

  const [deleted] = db.globalMessages.splice(index, 1);
  await writeDb(db);

  io.emit('global-message-deleted', { messageId: deleted.id });
  res.json({ ok: true, messageId: deleted.id });
});

app.post('/api/reports', requireAuth, async (req, res) => {
  const type = cleanText(req.body.type, 32);
  const reason = cleanText(req.body.reason, 400);
  if (!reason) return res.status(400).json({ error: 'Skriv en kort grund til rapporten.' });
  if (rejectBlockedContent(res, reason, 'Rapportgrund')) return;

  const db = req.db;
  db.reports = Array.isArray(db.reports) ? db.reports : [];
  const report = {
    id: id('report'),
    type,
    reporterId: req.user.id,
    status: 'open',
    ...encryptedTextObject('reason', reason),
    createdAt: new Date().toISOString()
  };

  if (type === 'global-message') {
    const message = (Array.isArray(db.globalMessages) ? db.globalMessages : []).find((candidate) => candidate.id === req.body.messageId);
    if (!message) return res.status(404).json({ error: 'Chatbeskeden blev ikke fundet.' });
    report.messageId = message.id;
    report.targetUserId = message.authorId;
    ensureReportSnapshot(db, report);
  } else if (type === 'global-comment') {
    const message = (Array.isArray(db.globalMessages) ? db.globalMessages : []).find((candidate) => candidate.id === req.body.messageId);
    if (!message) return res.status(404).json({ error: 'Chatbeskeden blev ikke fundet.' });
    normalizeGlobalMessageInteractions(message);
    const comment = message.comments.find((candidate) => candidate.id === req.body.commentId);
    if (!comment) return res.status(404).json({ error: 'Kommentaren blev ikke fundet.' });
    report.messageId = message.id;
    report.commentId = comment.id;
    report.targetUserId = comment.authorId;
    ensureReportSnapshot(db, report);
  } else if (type === 'direct-message') {
    const message = (Array.isArray(db.messages) ? db.messages : []).find((candidate) => candidate.id === req.body.messageId);
    if (!message) return res.status(404).json({ error: 'Beskeden blev ikke fundet.' });
    if (message.from !== req.user.id && message.to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Du kan kun rapportere beskeder fra dine egne samtaler.' });
    }
    report.messageId = message.id;
    report.targetUserId = message.from === req.user.id ? message.to : message.from;
    ensureReportSnapshot(db, report);
  } else if (type === 'user') {
    const target = db.users.find((candidate) => candidate.id === req.body.userId);
    if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke rapportere dig selv.' });
    report.targetUserId = target.id;

    const contextMessageId = cleanText(req.body.contextMessageId, 80);
    if (contextMessageId) {
      const contextMessage = (Array.isArray(db.messages) ? db.messages : []).find((candidate) => candidate.id === contextMessageId);
      const validContext = contextMessage && (
        (contextMessage.from === req.user.id && contextMessage.to === target.id) ||
        (contextMessage.from === target.id && contextMessage.to === req.user.id) ||
        req.user.role === 'admin'
      );
      if (validContext) report.contextMessageId = contextMessage.id;
    }

    ensureReportSnapshot(db, report);
  } else {
    return res.status(400).json({ error: 'Rapporttypen understøttes ikke.' });
  }

  db.reports.push(report);
  if (db.reports.length > 1000) db.reports = db.reports.slice(-1000);
  await writeDb(db);
  res.status(201).json({ ok: true, reportId: report.id, message: 'Rapport sendt til admin.' });
});

app.all(['/api/posts', '/api/posts/*', '/api/rooms', '/api/rooms/*'], requireAuth, (req, res) => {
  res.status(410).json({ error: 'TSN V1.5.1 understøtter globale chatbeskeder, privat chat, læsekvitteringer og tidsbegrænset slet-for-alle.' });
});

app.get('/api/messages/:userId', requireAuth, async (req, res) => {
  const db = req.db;
  const other = db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  const key = conversationId(req.user.id, other.id);
  await markConversationRead(req.db, req.user.id, other.id);

  const messages = db.messages
    .filter((message) => message.conversationId === key && !isMessageHiddenFor(message, req.user.id))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((message) => publicMessage(message, req.user.id, db.users));

  res.json({ user: { ...publicUser(other), unreadCount: 0 }, messages });
});

app.delete('/api/conversations/:userId', requireAuth, async (req, res) => {
  const db = req.db;
  const other = db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  const key = conversationId(req.user.id, other.id);
  let hiddenCount = 0;

  db.messages = (Array.isArray(db.messages) ? db.messages : []).filter((message) => {
    if (message.conversationId !== key) return true;
    hideMessageForUser(message, req.user.id);
    hiddenCount += 1;
    const participants = [message.from, message.to].filter(Boolean);
    const uniqueParticipants = [...new Set(participants)];
    const hiddenFor = Array.isArray(message.deletedFor) ? message.deletedFor : [];
    return !uniqueParticipants.length || !uniqueParticipants.every((participantId) => hiddenFor.includes(participantId));
  });

  await writeDb(db);
  io.to(req.user.id).emit('conversation-deleted', { userId: other.id, conversationId: key });
  res.json({ ok: true, userId: other.id, conversationId: key, hiddenCount });
});

app.post('/api/messages/:userId/read', requireAuth, async (req, res) => {
  const other = req.db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  await markConversationRead(req.db, req.user.id, other.id);
  res.json({ ok: true, userId: other.id, unreadCount: 0 });
});

app.post('/api/messages/:messageId/reactions', requireAuth, async (req, res) => {
  const emoji = String(req.body.emoji || '').trim();
  const db = req.db;
  const message = (Array.isArray(db.messages) ? db.messages : []).find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Beskeden blev ikke fundet.' });
  if (message.from !== req.user.id && message.to !== req.user.id) return res.status(403).json({ error: 'Du kan kun reagere på beskeder i dine egne samtaler.' });

  let reacted;
  try {
    reacted = toggleReactionOnItem(message, req.user.id, emoji);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const otherUserId = message.from === req.user.id ? message.to : message.from;
  if (reacted && otherUserId) {
    createNotification(db, otherUserId, 'reaction', `${getUserField(req.user, 'name')} reagerede på en privat besked`, `${emoji} i privat chat`, { type: 'direct-message', messageId: message.id });
  }
  await writeDb(db);
  io.to(message.from).emit('private-message-updated', publicMessage(message, message.from, db.users));
  io.to(message.to).emit('private-message-updated', publicMessage(message, message.to, db.users));
  res.json({ ok: true, reacted, message: publicMessage(message, req.user.id, db.users) });
});


app.delete('/api/messages/:messageId', requireAuth, async (req, res) => {
  const db = req.db;
  const index = db.messages.findIndex((candidate) => candidate.id === req.params.messageId);
  if (index < 0) return res.status(404).json({ error: 'Beskeden blev ikke fundet.' });

  const message = db.messages[index];
  const isAdmin = req.user.role === 'admin';
  const isSender = message.from === req.user.id;
  const sentAt = new Date(message.createdAt || 0).getTime();
  const messageAgeMs = Date.now() - sentAt;
  const isInsideDeleteWindow = Number.isFinite(sentAt) && messageAgeMs >= 0 && messageAgeMs <= PRIVATE_MESSAGE_DELETE_FOR_EVERYONE_MS;

  if (!isAdmin) {
    if (!isSender) {
      return res.status(403).json({ error: 'Du kan kun slette dine egne private beskeder for alle.' });
    }
    if (!isInsideDeleteWindow) {
      return res.status(403).json({ error: 'Du kan kun slette en privat besked for alle inden for 15 minutter efter, at du har sendt den.' });
    }
  }

  const [deleted] = db.messages.splice(index, 1);
  await writeDb(db);

  io.to(deleted.from).to(deleted.to).emit('message-deleted', { messageId: deleted.id, conversationId: deleted.conversationId });
  res.json({ ok: true, messageId: deleted.id, conversationId: deleted.conversationId, deletedForEveryone: true });
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
  if (!payload) return next(new Error('Ikke logget ind'));

  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === payload.sub);
  if (!user) return next(new Error('Brugeren blev ikke fundet'));
  if (isBanned(user)) return next(new Error('Kontoen er banned'));
  if (Number(payload.sv) !== getSessionVersion(user)) {
    return next(new Error('Sessionen er udløbet'));
  }

  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.user;
  onlineUsers.set(user.id, socket.id);
  socket.join(user.id);
  io.emit('presence', { userId: user.id, online: true });
  io.emit('tsn-stock-updated', getTsnStockSnapshot(readDb(), { persist: false, reason: 'presence' }));

  socket.on('private-message', async (payload, callback) => {
    try {
      const to = String(payload.to || '');
      const text = cleanText(payload.text, 1000);
      const attachment = normalizeImageAttachment(payload.attachment || payload.image || null);
      if (!to || (!text && !attachment)) throw new Error('Beskeden skal have en modtager og tekst eller billede.');
      if (text) assertContentAllowed(text, 'Besked');

      const db = readDb();
      const sender = db.users.find((candidate) => candidate.id === user.id);
      if (!sender || isBanned(sender)) throw new Error('Din konto har ikke tilladelse til at sende beskeder.');
      const spamError = applyChatAntiSpam(db, sender, text || '[billede]', 'private-chat');
      if (spamError) {
        await writeDb(db);
        throw new Error(spamError);
      }
      const recipient = db.users.find((candidate) => candidate.id === to);
      if (!recipient || isBanned(recipient)) throw new Error('Modtageren blev ikke fundet.');

      const message = {
        id: id('msg'),
        conversationId: conversationId(user.id, recipient.id),
        from: user.id,
        to: recipient.id,
        readBy: [user.id],
        ...encryptedTextObject('text', text),
        createdAt: new Date().toISOString()
      };
      setMessageAttachment(message, attachment);
      db.messages.push(message);
      createNotification(db, recipient.id, 'private-message', `Ny privat besked fra ${getUserField(sender, 'name')}`, attachment && !text ? 'Sendte et billede.' : text.slice(0, 180), { type: 'direct-message', userId: sender.id, messageId: message.id, hasImage: Boolean(attachment) });
      if (text) notifyMentions(db, text, sender, { type: 'direct-message', userId: sender.id, messageId: message.id });
      awardXp(db, sender.id, XP_PRIVATE_MESSAGE, 'privat besked', { messageId: message.id });
      addActivity(db, 'private-chat', `${getUserField(sender, 'name')} sendte en privat besked`, 'Privat aktivitet tæller til TSN-aktivitet uden at vise indholdet.', sender.id, { messageId: message.id });
      await writeDb(db);
      broadcastTsnStock(readDb(), 'private-message').catch((error) => console.warn(`TSN Stock update failed: ${error.message}`));
      io.to(user.id).emit('private-message', publicMessage(message, user.id, db.users));
      io.to(recipient.id).emit('private-message', publicMessage(message, recipient.id, db.users));
      if (typeof callback === 'function') callback({ ok: true, message: publicMessage(message, user.id, db.users) });
    } catch (error) {
      if (typeof callback === 'function') callback({ ok: false, error: error.message });
    }
  });

  socket.on('typing', (payload) => {
    const to = String(payload.to || '');
    if (to) socket.to(to).emit('typing', { from: user.id });
  });

  socket.on('call-user', (payload = {}, callback) => {
    try {
      const to = String(payload.to || '');
      const kind = payload.kind === 'video' ? 'video' : 'voice';
      const callId = cleanText(payload.callId || id('call'), 80);
      const offer = payload.offer || null;
      if (!to || to === user.id) throw new Error('Vælg en anden bruger at ringe til.');
      const db = readDb();
      const caller = db.users.find((candidate) => candidate.id === user.id);
      const recipient = db.users.find((candidate) => candidate.id === to);
      if (!caller || isBanned(caller)) throw new Error('Din konto kan ikke starte opkald.');
      if (!recipient || isBanned(recipient)) throw new Error('Brugeren blev ikke fundet.');
      const recipientOnline = onlineUsers.has(recipient.id);
      if (!recipientOnline) throw new Error('Brugeren er ikke online.');
      socket.to(recipient.id).emit('incoming-call', {
        callId,
        from: publicUser(caller),
        kind,
        offer,
        createdAt: new Date().toISOString()
      });
      if (typeof callback === 'function') callback({ ok: true, callId });
    } catch (error) {
      if (typeof callback === 'function') callback({ ok: false, error: error.message });
    }
  });

  socket.on('call-response', (payload = {}) => {
    const to = String(payload.to || '');
    if (!to || to === user.id) return;
    socket.to(to).emit('call-response', {
      callId: String(payload.callId || ''),
      from: user.id,
      accepted: Boolean(payload.accepted),
      answer: payload.answer || null,
      reason: cleanText(payload.reason || '', 140)
    });
  });

  socket.on('call-signal', (payload = {}) => {
    const to = String(payload.to || '');
    if (!to || to === user.id) return;
    socket.to(to).emit('call-signal', {
      callId: String(payload.callId || ''),
      from: user.id,
      signal: payload.signal || null
    });
  });

  socket.on('call-ended', (payload = {}) => {
    const to = String(payload.to || '');
    if (!to || to === user.id) return;
    socket.to(to).emit('call-ended', {
      callId: String(payload.callId || ''),
      from: user.id,
      reason: cleanText(payload.reason || '', 140)
    });
  });

  socket.on('disconnect', () => {
    const currentSocket = onlineUsers.get(user.id);
    if (currentSocket === socket.id) {
      onlineUsers.delete(user.id);
      io.emit('presence', { userId: user.id, online: false });
      io.emit('tsn-stock-updated', getTsnStockSnapshot(readDb(), { persist: false, reason: 'presence' }));
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

async function startServer() {
  try {
    await initDatabaseStorage();

    const beforeMigrationDb = readDb();
    if (databaseHasUserData(beforeMigrationDb)) {
      try {
        const backupFile = backupDatabase('pre-start');
        console.log(`Database backup created before startup migration: ${backupFile}`);
      } catch (error) {
        console.warn(`Startup backup skipped: ${error.message}`);
      }
    }

    await migrateDatabaseAtRest();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`TSN is running on port ${PORT}.`);
      if (USE_MONGODB) {
        console.log(`Database: MongoDB/${MONGODB_DB_NAME}.${MONGODB_STATE_COLLECTION}#${MONGODB_STATE_ID}`);
      } else {
        console.log(`Database file: ${DB_FILE}`);
      }
      console.log(`Backup directory: ${DB_BACKUP_DIR}`);
      const warning = storagePersistenceWarning();
      if (warning) console.warn(`Persistence warning: ${warning}`);
      console.log('TSN V1.5.15 mode: activity hub, XP, streaks, Pixabay/GIPHY media only, leaderboard, events, polls, TSN-S widget, manual badges, friends, notifications, mentions, reactions and warnings.');
      console.log('Admin rights can be claimed inside the app with TSN_ADMIN_SETUP_PASSWORD or TSN_ADMIN_SETUP_PASSWORD_HASH.');

      if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
        console.warn('WARNING: Set a strong JWT_SECRET before using TSN publicly.');
      }

      if (process.env.NODE_ENV === 'production' && DATA_ENCRYPTION_KEY === DEFAULT_DATA_ENCRYPTION_KEY) {
        console.warn('WARNING: Set TSN_DATA_ENCRYPTION_KEY before using TSN publicly.');
      }
    });
  } catch (error) {
    console.error('TSN failed to start:', error);
    process.exit(1);
  }
}

startServer();
