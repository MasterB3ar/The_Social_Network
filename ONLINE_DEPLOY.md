# Deploy TSN V1.1 online with Render + MongoDB Atlas

TSN V1.1 is chat-only: global chat + private chat.

## 1. MongoDB Atlas

Create a free M0 cluster, create a database user, allow network access, then copy the connection string.

## 2. Render web service

Create a Render Web Service from your GitHub repo.

Use:

```text
Build command: npm install
Start command: npm start
Health check:  /api/health
```

## 3. Render environment variables

```env
NODE_ENV=production
MONGODB_URI=<your MongoDB Atlas connection string>
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=<long random secret>
TSN_DATA_ENCRYPTION_KEY=<different long random secret>
TSN_ADMIN_SETUP_PASSWORD=<your admin setup password>
TSN_CONTENT_FILTER_ENABLED=true
```

## 4. Admin

Open the deployed website, log in, then claim admin from the sidebar using `TSN_ADMIN_SETUP_PASSWORD`.

## 5. Keep awake

Point a cron/monitor service at:

```text
https://your-tsn-site.onrender.com/api/ping
```

Every 10 minutes is enough for most Render Free keep-awake setups.
