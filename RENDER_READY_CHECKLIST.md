# TSN V1.0 Render + MongoDB checklist

Before deploying:

```text
[ ] Upload project to GitHub
[ ] Create MongoDB Atlas M0 cluster
[ ] Create MongoDB database user
[ ] Allow network access for Render
[ ] Copy MongoDB connection string
[ ] Create Render Web Service or Blueprint from render.yaml
[ ] Set MONGODB_URI in Render
[ ] Set JWT_SECRET in Render
[ ] Set TSN_DATA_ENCRYPTION_KEY in Render
[ ] Set TSN_ADMIN_SETUP_PASSWORD or TSN_ADMIN_SETUP_PASSWORD_HASH
[ ] Deploy
[ ] Open /api/health and confirm "mode": "mongodb"
[ ] Add external ping monitor to /api/ping every 10 minutes
```

Recommended Render env vars:

```env
NODE_ENV=production
NODE_VERSION=24.14.1
MONGODB_URI=...
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=...
TSN_DATA_ENCRYPTION_KEY=...
TSN_ADMIN_SETUP_PASSWORD=...
TSN_CONTENT_FILTER_ENABLED=true
TSN_BLOCKED_WORDS=
```

Never reset these after users exist:

```text
MONGODB_URI
TSN_DATA_ENCRYPTION_KEY
```

If you change `TSN_DATA_ENCRYPTION_KEY`, old encrypted usernames/messages will not decrypt correctly.
