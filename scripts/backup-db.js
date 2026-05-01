require('dotenv').config();

const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoClient } = require('mongodb');

const DEFAULT_LOCAL_DATA_DIR = path.join(os.homedir(), '.tsn-social-network');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : DEFAULT_LOCAL_DATA_DIR;
const DB_FILE = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = process.env.TSN_BACKUP_DIR ? path.resolve(process.env.TSN_BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'tsn';
const MONGODB_STATE_COLLECTION = process.env.MONGODB_STATE_COLLECTION || 'app_state';
const MONGODB_STATE_ID = process.env.MONGODB_STATE_ID || 'main';

async function main() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `db-${stamp}-manual.json`);

  if (MONGODB_URI) {
    const client = new MongoClient(MONGODB_URI, { appName: 'TSN-V1-Backup' });
    try {
      await client.connect();
      const doc = await client.db(MONGODB_DB_NAME).collection(MONGODB_STATE_COLLECTION).findOne({ _id: MONGODB_STATE_ID });
      if (!doc) throw new Error(`No MongoDB state document found: ${MONGODB_STATE_ID}`);
      const { _id, createdAt, updatedAt, ...db } = doc;
      fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));
      console.log(`MongoDB backup created: ${backupFile}`);
    } finally {
      await client.close();
    }
    return;
  }

  if (!fs.existsSync(DB_FILE)) {
    console.error(`No database found at: ${DB_FILE}`);
    process.exit(1);
  }

  fs.copyFileSync(DB_FILE, backupFile);
  console.log(`Backup created: ${backupFile}`);
}

main().catch((error) => {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
});
