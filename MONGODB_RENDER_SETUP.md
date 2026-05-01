# TSN V1.1: Render + MongoDB Atlas setup

This setup keeps TSN online on Render while storing accounts, global messages, private messages, unread state, bans, and admin data in MongoDB Atlas.

Set these Render environment variables:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=<long random secret>
TSN_DATA_ENCRYPTION_KEY=<different long random secret>
TSN_ADMIN_SETUP_PASSWORD=<your admin setup password>
```

Then deploy and check:

```text
https://your-tsn-site.onrender.com/api/health
```

`storage.mode` should say `mongodb`.
