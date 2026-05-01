# TSN V1.1

TSN is now a chat-only social network. The public feed and room system have been removed from the user interface. The app now has only:

- **Global chat** — one shared chat visible to every logged-in user
- **Private chat** — one-to-one realtime direct messages

It still supports username accounts, guest/demo login, admin moderation, unread private-message badges, public bios, server-side content filtering, encrypted-at-rest content, MongoDB Atlas storage, Render deployment, and keep-awake ping readiness.

## Main features

- Username-only login, register, guest login, and demo login
- Global chat stored in MongoDB/local JSON and updated realtime with Socket.IO
- Private one-to-one realtime chat with unread badges
- Profiles with display name and bio
- Admin access claim using `TSN_ADMIN_SETUP_PASSWORD` or `TSN_ADMIN_SETUP_PASSWORD_HASH`
- Admin tools for account moderation, backups, and global/private message deletion
- Server-side blocked-language filter
- AES-256-GCM encrypted-at-rest user identity fields and message text
- MongoDB Atlas persistent storage for Render

## Recommended online storage

For Render hosting, use MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
```

With `MONGODB_URI` set, TSN stores accounts, global messages, private messages, unread status, bans, and admin data in MongoDB. Render redeploys/restarts should not wipe the database.

If `MONGODB_URI` is empty, TSN falls back to local JSON storage outside the project folder:

```text
~/.tsn-social-network/db.json
```

## Render setup

Use the included:

```text
render.yaml
```

Required Render environment variables:

```env
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<generate a long random secret>
TSN_DATA_ENCRYPTION_KEY=<generate a different long random secret>
TSN_ADMIN_SETUP_PASSWORD=<your admin setup password>
TSN_CONTENT_FILTER_ENABLED=true
```

Do **not** change `TSN_DATA_ENCRYPTION_KEY` after real users/messages exist. It decrypts stored usernames, bios, global messages, and private messages.

## Keep-awake ping

TSN includes:

```text
/api/ping
```

Use an external monitor/cron service to request this URL every 10 minutes:

```text
https://your-tsn-site.onrender.com/api/ping
```

The ping helps reduce Render Free sleeping. MongoDB is still the real fix for data loss.

## Backup and restore

Create a backup:

```bash
npm run backup
```

Restore a backup:

```bash
npm run restore -- /full/path/to/db-backup.json
```

These scripts support both MongoDB mode and local JSON mode.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

## Important environment variables

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=change-this
TSN_DATA_ENCRYPTION_KEY=change-this-too
TSN_OLD_DATA_ENCRYPTION_KEYS=
TSN_ADMIN_SETUP_PASSWORD=change-this-admin-password
TSN_CONTENT_FILTER_ENABLED=true
TSN_BLOCKED_WORDS=
```

## Admin setup

1. Set `TSN_ADMIN_SETUP_PASSWORD` in Render.
2. Log into your TSN account.
3. Enter the admin setup password in the sidebar.
4. Your account becomes admin.

For stronger setup, hash the admin setup password locally:

```bash
npm run hash-secret -- "your-admin-password"
```

Then set the result as:

```env
TSN_ADMIN_SETUP_PASSWORD_HASH=<bcrypt-hash>
```

## Stored data model

```text
Users                 -> encrypted display name, username, bio + bcrypt password hash
Global messages       -> encrypted text + author id
Private messages      -> encrypted text + sender/recipient ids + read state
Bans/admin state      -> stored in the same app state document
```

MongoDB mode stores the app state in:

```text
Database:   tsn
Collection: app_state
Document:   main
```
