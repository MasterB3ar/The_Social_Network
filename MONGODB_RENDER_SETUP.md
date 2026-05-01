# TSN V1.0: Render + MongoDB Atlas setup

This setup keeps TSN online on Render while storing all accounts, posts, comments, private messages, rooms, room passwords, bans, and admin data in MongoDB Atlas.

## 1. Create MongoDB Atlas database

1. Go to MongoDB Atlas.
2. Create a free M0 cluster.
3. Create a database user with a username and password.
4. Go to Network Access.
5. For simple Render setup, allow access from `0.0.0.0/0`.
   - This is easier because Render free services do not have fixed outbound IPs.
   - Use a strong MongoDB database password.
6. Copy your connection string.

It should look like this:

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

Replace `USERNAME` and `PASSWORD` with your real database user details.

## 2. Deploy TSN on Render

1. Upload this project to GitHub.
2. Go to Render.
3. Create a Blueprint from the repo, or create a Web Service manually.
4. Use:

```text
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

## 3. Add Render environment variables

Add these in Render:

```env
NODE_ENV=production
NODE_VERSION=24.14.1
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=make-a-long-random-secret
TSN_DATA_ENCRYPTION_KEY=make-a-different-long-random-secret
TSN_ADMIN_SETUP_PASSWORD=your-admin-setup-password
TSN_CONTENT_FILTER_ENABLED=true
TSN_BLOCKED_WORDS=
```

Important: keep `TSN_DATA_ENCRYPTION_KEY` the same forever after real users/messages exist.

## 4. Check that MongoDB is active

Open:

```text
https://your-tsn-site.onrender.com/api/health
```

Look for:

```json
"mode": "mongodb"
```

If it says `json-file`, then `MONGODB_URI` is missing or wrong.

## 5. Back up MongoDB data

From your computer, with `.env` containing `MONGODB_URI`, run:

```bash
npm run backup
```

Restore:

```bash
npm run restore -- /full/path/to/db-backup.json
```

## 6. Migrating from old JSON data

If MongoDB is empty and TSN finds an old `db.json`, it imports that old JSON database into MongoDB automatically on first startup.

For local migration:

1. Put your old database at `~/.tsn-social-network/db.json` or `./data/db.json`.
2. Put `MONGODB_URI` in `.env`.
3. Run:

```bash
npm start
```

TSN will create the MongoDB state document and import the old data once.
