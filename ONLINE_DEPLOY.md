# Deploy TSN V1.0 online with Render + MongoDB Atlas

Recommended free-friendly setup:

```text
Render Free Web Service
+
MongoDB Atlas M0 Free Cluster
+
External /api/ping monitor every 10 minutes
```

MongoDB stores the data, so Render redeploys/restarts should not wipe accounts/messages.

## Step 1: MongoDB Atlas

1. Create a MongoDB Atlas account.
2. Create a free M0 cluster.
3. Create a database user.
4. In Network Access, allow Render to connect.
   - Easiest: `0.0.0.0/0`
   - Use a strong database password.
5. Copy the connection string.

Example:

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## Step 2: Upload TSN to GitHub

Upload the project folder contents to a GitHub repository.

## Step 3: Create Render service

Use Blueprint with `render.yaml`, or manually create a Web Service:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Plan: Free
```

## Step 4: Add environment variables on Render

```env
NODE_ENV=production
NODE_VERSION=24.14.1
MONGODB_URI=<your MongoDB Atlas connection string>
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=<long random secret>
TSN_DATA_ENCRYPTION_KEY=<different long random secret>
TSN_ADMIN_SETUP_PASSWORD=<your admin setup password>
TSN_CONTENT_FILTER_ENABLED=true
TSN_BLOCKED_WORDS=
```

Do not change `TSN_DATA_ENCRYPTION_KEY` after launch.

## Step 5: Confirm storage mode

Open:

```text
https://your-tsn-site.onrender.com/api/health
```

You should see:

```json
"mode": "mongodb"
```

## Step 6: Add keep-awake ping

Set an external monitor/cron service to hit this every 10 minutes:

```text
https://your-tsn-site.onrender.com/api/ping
```

See `CRON_KEEP_AWAKE.md`.

## Important

Render Free can still sleep if no requests are received. The ping helps with that, but MongoDB is what prevents data deletion.
