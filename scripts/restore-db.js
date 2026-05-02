require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoClient } = require('mongodb');

const source = process.argv[2];

if (!source) {
  console.error('Usage: npm run restore -- /full/path/to/db-backup.json');
  process.exit(1);
}

const sourceFile = path.resolve(source);
if (!fs.existsSync(sourceFile)) {
  console.error(`Backup file not found: ${sourceFile}`);
  process.exit(1);
}

const backupData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const DEFAULT_LOCAL_DATA_DIR = path.join(os.homedir(), '.tsn-social-network');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : DEFAULT_LOCAL_DATA_DIR;
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = process.env.TSN_BACKUP_DIR ? path.resolve(process.env.TSN_BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'tsn';
const MONGODB_STATE_COLLECTION = process.env.MONGODB_STATE_COLLECTION || 'app_state';
const MONGODB_STATE_ID = process.env.MONGODB_STATE_ID || 'main';

async function main() {
  if (MONGODB_URI) {
    const client = new MongoClient(MONGODB_URI, { appName: 'TSN-V1.2-Restore' });
    try {
      await client.connect();
      const collection = client.db(MONGODB_DB_NAME).collection(MONGODB_STATE_COLLECTION);
      const current = await collection.findOne({ _id: MONGODB_STATE_ID });
      if (current) {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safetyBackup = path.join(BACKUP_DIR, `db-${stamp}-before-mongo-restore.json`);
        const { _id, createdAt, updatedAt, ...currentDb } = current;
        fs.writeFileSync(safetyBackup, JSON.stringify(currentDb, null, 2));
        console.log(`Safety backup of current MongoDB database: ${safetyBackup}`);
      }

      await collection.updateOne(
        { _id: MONGODB_STATE_ID },
        { $set: { ...backupData, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      console.log(`Restored MongoDB state document: ${MONGODB_DB_NAME}.${MONGODB_STATE_COLLECTION}/${MONGODB_STATE_ID}`);
    } finally {
      await client.close();
    }
    return;
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyBackup = path.join(BACKUP_DIR, `db-${stamp}-before-restore.json`);
    fs.copyFileSync(DB_FILE, safetyBackup);
    console.log(`Safety backup of current database: ${safetyBackup}`);
  }

  fs.copyFileSync(sourceFile, DB_FILE);
  console.log(`Restored database to: ${DB_FILE}`);
}

main().catch((error) => {
  console.error(`Restore failed: ${error.message}`);
  process.exit(1);
});
