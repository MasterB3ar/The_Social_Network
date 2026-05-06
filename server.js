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
const ROOMS = Array.from({ length: 7 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    name: `Room ${id}`,
    tagline: 'Claim this room to rename it and optionally set a password.'
  };
});
// TSNM is earned only in TSN-S / TSN-Stock. Normal TSN only reads and spends the shared TSN-S wallet.
const TSNS_MONGODB_URI = process.env.TSNS_MONGODB_URI || process.env.TSN_STOCK_MONGODB_URI || MONGODB_URI;
const TSNS_MONGODB_DATABASE = process.env.TSNS_MONGODB_DATABASE || process.env.TSN_STOCK_MONGODB_DATABASE || 'tsn_stock';
const TSNS_WALLET_COLLECTION = process.env.TSNS_WALLET_COLLECTION || process.env.MONGODB_WALLET_COLLECTION || 'tsnMoneyWallets';
const DEFAULT_MARKET_ITEM_ID = 'pfp-neon-core';
const TSNM_MARKET_ITEMS = Object.freeze([
  {
    id: 'pfp-neon-core',
    type: 'profile-picture',
    name: 'Neon Core',
    price: 0,
    rarity: 'starter',
    symbol: '⚡',
    colors: ['#7c5cff', '#24d6ff'],
    animated: false,
    description: 'Gratis TSN-startprofilbillede.'
  },
  {
    id: 'pfp-midnight-bear',
    type: 'profile-picture',
    name: 'Midnight Bear',
    price: 80,
    rarity: 'common',
    symbol: '🐻',
    colors: ['#1b2440', '#7c5cff'],
    animated: false,
    description: 'Mørkt profilbillede med lilla TSN-glow.'
  },
  {
    id: 'pfp-cyber-cat',
    type: 'profile-picture',
    name: 'Cyber Cat',
    price: 120,
    rarity: 'rare',
    symbol: '🐱',
    colors: ['#00d4ff', '#ff4ecd'],
    animated: false,
    description: 'Farverigt profilbillede til chat og opslag.'
  },
  {
    id: 'pfp-gold-crown',
    type: 'profile-picture',
    name: 'Gold Crown',
    price: 180,
    rarity: 'epic',
    symbol: '👑',
    colors: ['#ffb703', '#ff6b35'],
    animated: false,
    description: 'Premium-look til din TSN-profil.'
  },
  {
    id: 'gif-fire-loop',
    type: 'animated-gif',
    name: 'Fire Loop GIF',
    price: 220,
    rarity: 'rare',
    symbol: '🔥',
    colors: ['#ff3b30', '#ffb703'],
    animated: true,
    description: 'Animeret GIF-avatar med varm glow-effekt.'
  },
  {
    id: 'gif-galaxy-spin',
    type: 'animated-gif',
    name: 'Galaxy Spin GIF',
    price: 280,
    rarity: 'epic',
    symbol: '🌌',
    colors: ['#7c5cff', '#00e5ff'],
    animated: true,
    description: 'Animeret galaxy-profilbillede til TSN.'
  },
  {
    id: 'gif-matrix-rain',
    type: 'animated-gif',
    name: 'Matrix Rain GIF',
    price: 320,
    rarity: 'epic',
    symbol: '⌁',
    colors: ['#00ff88', '#062b18'],
    animated: true,
    description: 'Hacker-agtig animeret GIF-avatar.'
  },
  {
    id: 'gif-thunder-vip',
    type: 'animated-gif',
    name: 'Thunder VIP GIF',
    price: 420,
    rarity: 'legendary',
    symbol: '⚡',
    colors: ['#f9f871', '#7c5cff'],
    animated: true,
    description: 'Legendarisk animeret GIF-avatar med elektrisk effekt.'
  }
]);
const app = express();
const pendingUsernameRegistrations = new Set();
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
  return { users: [], posts: [], messages: [], globalMessages: [], rooms: [], roomMessages: [], reports: [], marketTransactions: [], tsnStock: null };
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
        (Array.isArray(db.marketTransactions) && db.marketTransactions.length) ||
        (db.tsnStock && Array.isArray(db.tsnStock.history) && db.tsnStock.history.length) ||
        (Array.isArray(db.rooms) && db.rooms.some((room) => room.ownerId || room.nameEnc || room.passwordHash))
      )
  );
}

function normalizeDatabaseShape(db) {
  return {
    users: Array.isArray(db?.users) ? db.users : [],
    posts: Array.isArray(db?.posts) ? db.posts : [],
    messages: Array.isArray(db?.messages) ? db.messages : [],
    globalMessages: Array.isArray(db?.globalMessages) ? db.globalMessages : [],
    rooms: Array.isArray(db?.rooms) ? db.rooms : [],
    roomMessages: Array.isArray(db?.roomMessages) ? db.roomMessages : [],
    reports: Array.isArray(db?.reports) ? db.reports : [],
    marketTransactions: Array.isArray(db?.marketTransactions) ? db.marketTransactions : [],
    tsnStock: normalizeTsnStockState(db?.tsnStock)
  };
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
  const globalCommentsPerHour = (Array.isArray(db.globalMessages) ? db.globalMessages : []).reduce((total, message) => {
    return total + countSince(message.comments || [], hourAgoMs);
  }, 0);
  const messagesPerHour = privateMessagesPerHour + globalCommentsPerHour;
  const postsPerHour = countSince(db.globalMessages, hourAgoMs);
  const expected = expectedActivityForHour(now.getHours());

  const expectedOnline = Math.max(1, usersTotal * expected.online);
  const expectedMessages = Math.max(1, usersTotal * 3.2 * expected.messages);
  const expectedPosts = Math.max(1, usersTotal * 0.9 * expected.posts);
  const onlineRatio = onlineCount / expectedOnline;
  const messageRatio = messagesPerHour / expectedMessages;
  const postRatio = postsPerHour / expectedPosts;
  const activityScore = Math.max(0, Math.min(3.5, onlineRatio * 0.45 + messageRatio * 0.30 + postRatio * 0.25));

  const previousPrice = Number(db.tsnStock.price) || 100;
  const targetPrice = 100 * (0.68 + activityScore * 0.62);
  const timePressure = (expected.online + expected.messages + expected.posts) / 3;
  const momentum = Math.max(-3.5, Math.min(5.5, (postsPerHour * 0.35 + messagesPerHour * 0.07 + onlineCount * 0.45) * (0.55 + timePressure) - 1.2));
  const rawPrice = previousPrice + (targetPrice - previousPrice) * 0.22 + momentum;
  const price = Number(Math.max(1, Math.min(9999, rawPrice)).toFixed(2));
  const change = Number((price - previousPrice).toFixed(2));
  const changePercent = Number((previousPrice ? (change / previousPrice) * 100 : 0).toFixed(2));
  const trend = change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat';
  const generatedAt = now.toISOString();

  const snapshot = {
    symbol: 'TSN',
    name: 'TSN Stock',
    disclaimer: 'Fiktiv TSN-aktivitetspris. Ikke en rigtig aktie og ikke finansiel rådgivning.',
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
      messagesPerHour: 30,
      postsPerHour: 25
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
let tsnsMoneyMongoClient = null;
let tsnsMoneyWalletCollection = null;
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

function getMarketItem(itemId) {
  const normalized = String(itemId || '').trim();
  return TSNM_MARKET_ITEMS.find((item) => item.id === normalized) || null;
}

function publicMarketItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    price: item.price,
    rarity: item.rarity,
    symbol: item.symbol,
    colors: Array.isArray(item.colors) ? item.colors.slice(0, 2) : ['#7c5cff', '#24d6ff'],
    animated: Boolean(item.animated),
    description: item.description
  };
}

function sanitizeTsnmPlayerId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function getTsnmPlayerName(user) {
  return cleanText(getUserField(user, 'name') || getUserField(user, 'username') || 'TSN User', 40) || 'TSN User';
}

function defaultTsnmWallet(user) {
  const now = new Date().toISOString();
  return {
    playerId: sanitizeTsnmPlayerId(user?.id),
    playerName: getTsnmPlayerName(user),
    balance: 0,
    shares: 0,
    avgBuyPrice: 0,
    realizedProfit: 0,
    totalEarned: 0,
    totalBought: 0,
    totalSold: 0,
    lastRewardAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function walletBalance(wallet) {
  const balance = Number(wallet?.balance);
  return Number.isFinite(balance) ? clampInteger(balance, 0, 999999999) : 0;
}

async function getTsnsMoneyWalletCollection() {
  if (!TSNS_MONGODB_URI) throw new Error('TSN-S wallet MongoDB is not configured. Set TSNS_MONGODB_URI or use the same MONGODB_URI as TSN-S.');
  if (!MongoClient) throw new Error('MongoDB driver is not installed. Run npm install.');
  if (tsnsMoneyWalletCollection) return tsnsMoneyWalletCollection;

  if (!tsnsMoneyMongoClient) {
    tsnsMoneyMongoClient = new MongoClient(TSNS_MONGODB_URI, {
      serverSelectionTimeoutMS: 12000,
      connectTimeoutMS: 12000,
      maxPoolSize: 8
    });
    await tsnsMoneyMongoClient.connect();
  }

  const db = tsnsMoneyMongoClient.db(TSNS_MONGODB_DATABASE);
  tsnsMoneyWalletCollection = db.collection(TSNS_WALLET_COLLECTION);
  await tsnsMoneyWalletCollection.createIndex({ playerId: 1 }, { unique: true });
  await tsnsMoneyWalletCollection.createIndex({ updatedAt: -1 });
  return tsnsMoneyWalletCollection;
}

async function getTsnsWallet(user, { create = true } = {}) {
  if (!user) return defaultTsnmWallet(null);
  const playerId = sanitizeTsnmPlayerId(user.id);
  if (!playerId || !TSNS_MONGODB_URI) return defaultTsnmWallet(user);

  const collection = await getTsnsMoneyWalletCollection();
  const existing = await collection.findOne({ playerId }, { projection: { _id: 0 } });
  const playerName = getTsnmPlayerName(user);
  if (existing) {
    if (existing.playerName !== playerName) {
      await collection.updateOne({ playerId }, { $set: { playerName, updatedAt: new Date().toISOString() } });
      existing.playerName = playerName;
    }
    return existing;
  }

  const wallet = defaultTsnmWallet(user);
  if (create) await collection.insertOne(wallet);
  return wallet;
}

async function spendTsnsTsnm(user, amount) {
  const cost = clampInteger(amount, 0, 999999999);
  const playerId = sanitizeTsnmPlayerId(user?.id);
  if (!cost) return getTsnsWallet(user);
  if (!playerId) throw new Error('Kontoen mangler et gyldigt TSN-S wallet-id.');
  if (!TSNS_MONGODB_URI) throw new Error('TSN-S wallet er ikke forbundet. Sæt TSNS_MONGODB_URI eller brug samme MONGODB_URI som TSN-S.');

  const collection = await getTsnsMoneyWalletCollection();
  await getTsnsWallet(user, { create: true });
  const now = new Date().toISOString();
  const result = await collection.findOneAndUpdate(
    { playerId, balance: { $gte: cost } },
    {
      $inc: { balance: -cost },
      $set: { playerName: getTsnmPlayerName(user), updatedAt: now }
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  );

  const updatedWallet = result?.value || result;
  if (!updatedWallet) {
    const wallet = await getTsnsWallet(user, { create: true });
    const missing = Math.max(0, cost - walletBalance(wallet));
    const error = new Error(`Du mangler ${missing} TSNM for at købe dette item. TSNM kan kun optjenes i TSN-S.`);
    error.statusCode = 402;
    throw error;
  }

  return updatedWallet;
}

function getTsnmBalance() {
  // Normal TSN never creates TSNM. The real balance comes from the shared TSN-S wallet in market routes.
  return 0;
}

function normalizeOwnedCosmetics(user) {
  const validIds = new Set(TSNM_MARKET_ITEMS.map((item) => item.id));
  const owned = Array.isArray(user?.ownedCosmeticIds) ? user.ownedCosmeticIds : [];
  const unique = [...new Set([DEFAULT_MARKET_ITEM_ID, ...owned.map(String)])]
    .filter((itemId) => validIds.has(itemId));
  return unique.length ? unique : [DEFAULT_MARKET_ITEM_ID];
}

function normalizeUserMarketState(user) {
  if (!user) return null;
  user.ownedCosmeticIds = normalizeOwnedCosmetics(user);
  if (!getMarketItem(user.equippedCosmeticId) || !user.ownedCosmeticIds.includes(user.equippedCosmeticId)) {
    user.equippedCosmeticId = user.ownedCosmeticIds[0] || DEFAULT_MARKET_ITEM_ID;
  }
  return user;
}

function getEquippedCosmetic(user) {
  if (!user) return publicMarketItem(getMarketItem(DEFAULT_MARKET_ITEM_ID));
  const owned = normalizeOwnedCosmetics(user);
  const itemId = owned.includes(user.equippedCosmeticId) ? user.equippedCosmeticId : owned[0];
  return publicMarketItem(getMarketItem(itemId) || getMarketItem(DEFAULT_MARKET_ITEM_ID));
}

function publicMarketState(user, db = null, wallet = null) {
  normalizeUserMarketState(user);
  const transactions = (Array.isArray(db?.marketTransactions) ? db.marketTransactions : [])
    .filter((entry) => entry.userId === user.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 25)
    .map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      reason: entry.reason,
      itemId: entry.itemId || null,
      createdAt: entry.createdAt
    }));

  return {
    currency: 'TSNM',
    balance: walletBalance(wallet),
    source: 'TSN-S',
    earningDisabledInTsn: true,
    walletConnected: Boolean(TSNS_MONGODB_URI) && !wallet?.error,
    walletError: wallet?.error || null,
    ownedItemIds: normalizeOwnedCosmetics(user),
    equippedItemId: user.equippedCosmeticId || DEFAULT_MARKET_ITEM_ID,
    equippedItem: getEquippedCosmetic(user),
    items: TSNM_MARKET_ITEMS.map(publicMarketItem),
    transactions
  };
}

function recordTsnmTransaction(db, user, amount, reason, itemId = null) {
  if (!db || !user || !amount) return null;
  db.marketTransactions = Array.isArray(db.marketTransactions) ? db.marketTransactions : [];
  const entry = {
    id: id('tsnmtx'),
    userId: user.id,
    amount: clampInteger(amount, -999999999, 999999999),
    reason: cleanText(reason, 80) || 'TSNM',
    itemId: itemId || null,
    balanceAfter: null,
    source: 'TSN-S',
    createdAt: new Date().toISOString()
  };
  db.marketTransactions.push(entry);
  db.marketTransactions = db.marketTransactions.slice(-3000);
  return entry;
}

async function emitMarketState(user, db) {
  if (!user) return;
  const wallet = await getTsnsWallet(user).catch(() => defaultTsnmWallet(user));
  io.to(user.id).emit('market-updated', {
    user: publicUser(user),
    market: publicMarketState(user, db, wallet)
  });
}

function emitUserProfileUpdated(user) {
  if (!user) return;
  io.emit('user-profile-updated', { user: publicUser(user) });
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

function getSessionVersion(user) {
  const version = Number(user && user.sessionVersion);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

function publicUser(user) {
  if (!user) return null;
  const role = user.role === 'admin' ? 'admin' : 'user';
  normalizeUserMarketState(user);
  return {
    id: user.id,
    name: getUserField(user, 'name'),
    username: getUserField(user, 'username'),
    bio: getUserField(user, 'bio'),
    role,
    isAdmin: role === 'admin',
    banned: isBanned(user),
    bannedAt: user.bannedAt || null,
    createdAt: user.createdAt,
    tsnmBalance: getTsnmBalance(user),
    ownedCosmeticIds: normalizeOwnedCosmetics(user),
    equippedCosmeticId: user.equippedCosmeticId || DEFAULT_MARKET_ITEM_ID,
    profileCosmetic: getEquippedCosmetic(user)
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
    globalPosts: globalMessages.length,
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
    createdAt: message.createdAt,
    author: publicUser(author),
    likesCount: message.likes.length,
    likedByMe: viewerId ? message.likes.includes(viewerId) : false,
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

function publicMessage(message) {
  const readBy = Array.isArray(message.readBy) ? [...new Set(message.readBy.filter(Boolean))] : [];
  return {
    id: message.id,
    conversationId: message.conversationId,
    from: message.from,
    to: message.to,
    text: getEncryptedObjectField(message, 'text'),
    createdAt: message.createdAt,
    readBy,
    isReadByRecipient: Boolean(message.to && readBy.includes(message.to))
  };
}

function getReportReason(report) {
  return getEncryptedObjectField(report, 'reason');
}

function reportStatusLabel(status) {
  return status === 'resolved' ? 'løst' : 'åben';
}

function findReportTarget(db, report) {
  const users = Array.isArray(db.users) ? db.users : [];
  const globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const directMessages = Array.isArray(db.messages) ? db.messages : [];
  const findUser = (userId) => users.find((user) => user.id === userId);

  if (report.type === 'global-message') {
    const message = globalMessages.find((candidate) => candidate.id === report.messageId);
    const author = message ? findUser(message.authorId) : null;
    return {
      exists: Boolean(message),
      type: report.type,
      label: 'Globalt opslag',
      body: message ? getEncryptedObjectField(message, 'text') : 'Opslaget findes ikke længere.',
      createdAt: message?.createdAt || null,
      author: adminMessageActor(author),
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
      type: report.type,
      label: 'Global kommentar',
      body: comment ? getEncryptedObjectField(comment, 'text') : 'Kommentaren findes ikke længere.',
      parentBody: message ? getEncryptedObjectField(message, 'text') : '',
      createdAt: comment?.createdAt || null,
      author: adminMessageActor(author),
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
      type: report.type,
      label: 'Privat besked',
      body: message ? getEncryptedObjectField(message, 'text') : 'Beskeden findes ikke længere.',
      createdAt: message?.createdAt || null,
      author: adminMessageActor(fromUser),
      toUser: adminMessageActor(toUser),
      messageId: report.messageId,
      conversationId: message?.conversationId || ''
    };
  }

  if (report.type === 'user') {
    const targetUser = findUser(report.targetUserId);
    return {
      exists: Boolean(targetUser),
      type: report.type,
      label: 'Bruger',
      body: targetUser ? `${getUserField(targetUser, 'name')} (@${getUserField(targetUser, 'username')})` : 'Brugeren findes ikke længere.',
      createdAt: targetUser?.createdAt || null,
      author: adminMessageActor(targetUser),
      userId: report.targetUserId
    };
  }

  return { exists: false, type: report.type || 'ukendt', label: 'Ukendt rapport', body: 'Målet findes ikke.', createdAt: null };
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
      commentsRemoved += beforeComments - message.comments.length;
      likesRemoved += beforeLikes - message.likes.length;
      return message;
    });
  db.messages = (Array.isArray(db.messages) ? db.messages : []).filter((message) => message.from !== userId && message.to !== userId);
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
      body: getEncryptedObjectField(message, 'text'),
      createdAt: message.createdAt,
      likesCount: message.likes.length,
      commentsCount: message.comments.length
    });

    message.comments.forEach((comment) => {
      pushItem({
        id: `global-comment:${message.id}:${comment.id}`,
        kind: 'global-comment',
        label: 'global kommentar',
        source: 'Kommentar til global chat',
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
    pushItem({
      id: `direct:${message.id}`,
      kind: 'direct-message',
      label: 'privat besked',
      source: 'Privat chat',
      messageId: message.id,
      conversationId: message.conversationId,
      fromUser: adminMessageActor(findUser(message.from)),
      toUser: adminMessageActor(findUser(message.to)),
      body: getEncryptedObjectField(message, 'text'),
      createdAt: message.createdAt,
      readByCount: Array.isArray(message.readBy) ? message.readBy.length : 0
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
      app: 'TSN V1.2.9',
      shortName: 'TSN V1.2.4',
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
        accountPasswords: 'bcrypt-hashed',
        userIdentityFields: 'aes-256-gcm encrypted',
        globalMessages: 'aes-256-gcm encrypted at rest',
        privateMessages: 'aes-256-gcm encrypted at rest',
        usernameLookup: 'hmac-sha256',
        sessions: 'versioned JWT sessions support admin kick/logout',
        moderation: 'admins can delete global/private messages, handle reports, kick accounts, ban accounts, unban accounts, and review stored messages for moderation',
        contentFilter: CONTENT_FILTER_ENABLED ? 'server-side blocked-language filter enabled' : 'disabled',
        customBlockedWords: CUSTOM_BLOCKED_WORDS.length,
        adminRights: 'claimable with server-side admin setup password'
      }
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      app: 'TSN V1.2.9',
      shortName: 'TSN V1.2.4',
      error: 'Lageret er ikke klar.',
      detail: error.message
    });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    app: 'TSN V1.2',
    message: 'pong',
    now: new Date().toISOString()
  });
});

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
      // TSNM is earned in TSN-S only. Normal TSN stores cosmetics, not currency generation.
      ownedCosmeticIds: [DEFAULT_MARKET_ITEM_ID],
      equippedCosmeticId: DEFAULT_MARKET_ITEM_ID,
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

  if (repairUserLookupHashIfNeeded(user, login)) await writeDb(db);

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

  if (name && rejectBlockedContent(res, name, 'Visningsnavn')) return;
  if (bio && rejectBlockedContent(res, bio, 'Bio')) return;

  if (name) setEncryptedUserField(user, 'name', name);
  setEncryptedUserField(user, 'bio', bio);
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
  if (status === 'admins') users = users.filter((user) => user.isAdmin);
  if (status === 'reported') users = users.filter((user) => Number(user.stats?.openReportsAgainstCount || 0) > 0);

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
  } else if (type === 'direct') {
    items = items.filter((item) => item.kind === 'direct-message');
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
    limit,
    offset,
    nextOffset,
    hasMore: nextOffset < totalCount,
    generatedAt: new Date().toISOString(),
    notice: 'Moderationsvisning kun for admin. Beskeder er krypteret i databasen og dekrypteres på serveren for admins.'
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
    if (!deleted) return res.status(404).json({ error: 'Opslaget findes ikke længere.' });
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
      ...publicUser(user),
      online: onlineUsers.has(user.id),
      unreadCount: getUnreadMessageCount(req.db, req.user.id, user.id)
    }))
    .filter((user) => !q || user.name.toLowerCase().includes(q) || user.username.toLowerCase().includes(q) || String(user.bio || '').toLowerCase().includes(q))
    .sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  res.json({ users });
});


app.get('/api/public/stock', (req, res) => {
  const db = readDb();
  const snapshot = getTsnStockSnapshot(db, { persist: false, reason: 'public-view' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ stock: snapshot });
});

app.get('/api/stock', requireAuth, (req, res) => {
  const snapshot = getTsnStockSnapshot(req.db, { persist: false, reason: 'view' });
  res.json({ stock: snapshot });
});

app.get('/api/market', requireAuth, async (req, res) => {
  const user = req.db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Kontoen blev ikke fundet.', logout: true });
  const wallet = await getTsnsWallet(user).catch((error) => ({ ...defaultTsnmWallet(user), error: error.message }));
  res.json({ market: publicMarketState(user, req.db, wallet) });
});

app.post('/api/market/claim-daily', requireAuth, (req, res) => {
  res.status(403).json({
    error: 'TSNM kan kun optjenes i TSN-S. Åbn TSN-S/TSN-Stock for at tjene TSNM, og brug dem derefter i TSN Market.'
  });
});

app.post('/api/market/buy', requireAuth, async (req, res) => {
  const item = getMarketItem(req.body.itemId);
  if (!item) return res.status(404).json({ error: 'Market-item blev ikke fundet.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Kontoen blev ikke fundet.', logout: true });

  normalizeUserMarketState(user);
  if (user.ownedCosmeticIds.includes(item.id)) {
    const wallet = await getTsnsWallet(user).catch(() => defaultTsnmWallet(user));
    return res.json({ ok: true, alreadyOwned: true, user: publicUser(user), market: publicMarketState(user, db, wallet) });
  }

  let wallet;
  try {
    wallet = await spendTsnsTsnm(user, item.price);
  } catch (error) {
    return res.status(error.statusCode || 503).json({ error: error.message });
  }

  user.ownedCosmeticIds.push(item.id);
  recordTsnmTransaction(db, user, -item.price, 'buy-cosmetic', item.id);
  await writeDb(db);

  const market = publicMarketState(user, db, wallet);
  emitMarketState(user, db).catch((error) => console.warn(`TSNM market emit failed: ${error.message}`));
  res.json({ ok: true, user: publicUser(user), market, item: publicMarketItem(item) });
});

app.post('/api/market/equip', requireAuth, async (req, res) => {
  const item = getMarketItem(req.body.itemId);
  if (!item) return res.status(404).json({ error: 'Market-item blev ikke fundet.' });

  const db = req.db;
  const user = db.users.find((candidate) => candidate.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Kontoen blev ikke fundet.', logout: true });

  normalizeUserMarketState(user);
  if (!user.ownedCosmeticIds.includes(item.id)) {
    return res.status(403).json({ error: 'Du skal købe dette item, før du kan bruge det.' });
  }

  user.equippedCosmeticId = item.id;
  await writeDb(db);

  const wallet = await getTsnsWallet(user).catch(() => defaultTsnmWallet(user));
  const market = publicMarketState(user, db, wallet);
  emitMarketState(user, db).catch((error) => console.warn(`TSNM market emit failed: ${error.message}`));
  emitUserProfileUpdated(user);
  res.json({ ok: true, user: publicUser(user), market, item: publicMarketItem(item) });
});

app.get('/api/global/messages', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const messages = [...(req.db.globalMessages || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((message) => attachGlobalMessagePeople(message, req.db.users, req.user.id));

  res.json({ messages });
});

app.post('/api/global/messages', requireAuth, async (req, res) => {
  const text = cleanText(req.body.text || req.body.body, 600);
  if (!text) return res.status(400).json({ error: 'Global besked må ikke være tom.' });
  if (rejectBlockedContent(res, text, 'Global besked')) return;

  const db = req.db;
  const message = {
    id: id('globalmsg'),
    authorId: req.user.id,
    likes: [],
    comments: [],
    ...encryptedTextObject('text', text),
    createdAt: new Date().toISOString()
  };

  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  db.globalMessages.push(message);
  if (db.globalMessages.length > 1000) {
    db.globalMessages = db.globalMessages.slice(-1000);
  }

  await writeDb(db);

  emitGlobalMessageUpdated(db, message);
  broadcastTsnStock(readDb(), 'global-post').catch((error) => console.warn(`TSN Stock update failed: ${error.message}`));
  res.status(201).json({ message: attachGlobalMessagePeople(message, db.users, req.user.id) });
});

app.post('/api/global/messages/:messageId/like', requireAuth, async (req, res) => {
  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Globalt opslag blev ikke fundet.' });

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

app.post('/api/global/messages/:messageId/comments', requireAuth, async (req, res) => {
  const text = cleanText(req.body.text || req.body.body, 400);
  if (!text) return res.status(400).json({ error: 'Kommentar må ikke være tom.' });
  if (rejectBlockedContent(res, text, 'Kommentar')) return;

  const db = req.db;
  db.globalMessages = Array.isArray(db.globalMessages) ? db.globalMessages : [];
  const message = db.globalMessages.find((candidate) => candidate.id === req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Globalt opslag blev ikke fundet.' });

  normalizeGlobalMessageInteractions(message);
  const comment = {
    id: id('gcomment'),
    authorId: req.user.id,
    ...encryptedTextObject('text', text),
    createdAt: new Date().toISOString()
  };

  message.comments.push(comment);
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
  if (!message) return res.status(404).json({ error: 'Globalt opslag blev ikke fundet.' });

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
    return res.status(403).json({ error: 'Du kan kun slette dine egne globale beskeder, medmindre du er admin.' });
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
    if (!message) return res.status(404).json({ error: 'Opslaget blev ikke fundet.' });
    report.messageId = message.id;
    report.targetUserId = message.authorId;
  } else if (type === 'global-comment') {
    const message = (Array.isArray(db.globalMessages) ? db.globalMessages : []).find((candidate) => candidate.id === req.body.messageId);
    if (!message) return res.status(404).json({ error: 'Opslaget blev ikke fundet.' });
    normalizeGlobalMessageInteractions(message);
    const comment = message.comments.find((candidate) => candidate.id === req.body.commentId);
    if (!comment) return res.status(404).json({ error: 'Kommentaren blev ikke fundet.' });
    report.messageId = message.id;
    report.commentId = comment.id;
    report.targetUserId = comment.authorId;
  } else if (type === 'direct-message') {
    const message = (Array.isArray(db.messages) ? db.messages : []).find((candidate) => candidate.id === req.body.messageId);
    if (!message) return res.status(404).json({ error: 'Beskeden blev ikke fundet.' });
    if (message.from !== req.user.id && message.to !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Du kan kun rapportere beskeder fra dine egne samtaler.' });
    }
    report.messageId = message.id;
    report.targetUserId = message.from === req.user.id ? message.to : message.from;
  } else if (type === 'user') {
    const target = db.users.find((candidate) => candidate.id === req.body.userId);
    if (!target) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Du kan ikke rapportere dig selv.' });
    report.targetUserId = target.id;
  } else {
    return res.status(400).json({ error: 'Rapporttypen understøttes ikke.' });
  }

  db.reports.push(report);
  if (db.reports.length > 1000) db.reports = db.reports.slice(-1000);
  await writeDb(db);
  res.status(201).json({ ok: true, reportId: report.id, message: 'Rapport sendt til admin.' });
});

app.all(['/api/posts', '/api/posts/*', '/api/rooms', '/api/rooms/*'], requireAuth, (req, res) => {
  res.status(410).json({ error: 'TSN V1.2.6 understøtter globale opslag, privat chat, læsekvitteringer og tidsbegrænset slet-for-alle.' });
});

app.get('/api/messages/:userId', requireAuth, async (req, res) => {
  const other = req.db.users.find((user) => user.id === req.params.userId);
  if (!other) return res.status(404).json({ error: 'Brugeren blev ikke fundet.' });

  const key = conversationId(req.user.id, other.id);
  await markConversationRead(req.db, req.user.id, other.id);

  const messages = req.db.messages
    .filter((message) => message.conversationId === key && !isMessageHiddenFor(message, req.user.id))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(publicMessage);

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
      if (!to || !text) throw new Error('Beskeden skal have en modtager og tekst.');
      assertContentAllowed(text, 'Besked');

      const db = readDb();
      const sender = db.users.find((candidate) => candidate.id === user.id);
      if (!sender || isBanned(sender)) throw new Error('Din konto har ikke tilladelse til at sende beskeder.');
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
      const safeMessage = publicMessage(message);

      db.messages.push(message);
      await writeDb(db);
      broadcastTsnStock(readDb(), 'private-message').catch((error) => console.warn(`TSN Stock update failed: ${error.message}`));
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
      console.log('TSN V1.3.1 mode: TSNM Market uses TSN-S wallet only, public TSN Stock API, global posts and private chat.');
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
