# TSN V1.0

A full-stack social media starter app with username accounts, public posts, private chat, 7 claimable rooms, optional room passwords, admin moderation, unread direct-message badges, public bios, server-side content filtering, encrypted-at-rest content, and **MongoDB-ready persistent storage**.

## What is new in this build

- MongoDB Atlas storage support with `MONGODB_URI`
- Render Free-ready deployment using MongoDB instead of Render filesystem storage
- `/api/ping` endpoint for external uptime/cron monitors
- `npm run ping-self` helper for cron services
- MongoDB-aware backup and restore scripts
- Old JSON database import: if MongoDB is empty and an old local `db.json` exists, TSN imports it once

## Main features

- Username-only login, guest login, and demo login
- Simple account passwords allowed: 4+ characters, so `1234` works if a user wants that
- Public feed with posts, comments, likes, and user-owned delete controls
- Private real-time chat with Socket.IO
- Red unread-message badges for direct messages
- Message threads keep scroll position when new messages arrive
- 7 TSN Rooms named `Room 1` through `Room 7` by default
- Room owners/admins can rename rooms and optionally set/remove a room password
- Releasing a room resets it and deletes all messages in that room
- Public user bios in People/search/chat
- Admin tools: delete content, review all stored messages, kick/ban/unban accounts, and create backups
- Server-side blocked-language filter
- Render-ready deployment files

## Recommended storage

For online hosting, use MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
```

With `MONGODB_URI` set, TSN stores accounts, posts, comments, direct messages, rooms, room passwords, unread status, bans, and admin settings in MongoDB. Render redeploys/restarts should not wipe the database.

If `MONGODB_URI` is empty, TSN falls back to local JSON storage outside the project folder:

```text
~/.tsn-social-network/db.json
```

## Render setup

Use the included:

```text
render.yaml
```

It is configured for:

```text
Render Free web service + MongoDB Atlas
```

Required Render environment variables:

```env
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<generate a long random secret>
TSN_DATA_ENCRYPTION_KEY=<generate a different long random secret>
TSN_ADMIN_SETUP_PASSWORD=<your admin setup password>
TSN_CONTENT_FILTER_ENABLED=true
```

Do **not** change `TSN_DATA_ENCRYPTION_KEY` after real users/messages exist. It decrypts stored usernames, bios, posts, comments, DMs, and room messages.

## Keep-awake ping

TSN includes:

```text
/api/ping
```

Use an external monitor/cron service to request this URL every 10 minutes:

```text
https://your-tsn-site.onrender.com/api/ping
```

You can also run:

```bash
TSN_PING_URL=https://your-tsn-site.onrender.com/api/ping npm run ping-self
```

Important: the keep-awake ping is only a workaround for Render Free sleeping. MongoDB is the real fix for data loss.

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

To test MongoDB locally, put your Atlas connection string into `.env` as `MONGODB_URI`.

## Encryption and hashing

Encrypted at rest:

```text
Display names       -> nameEnc
Usernames           -> usernameEnc
Bios                -> bioEnc
Posts/comments      -> bodyEnc
Private messages    -> textEnc
Room messages       -> textEnc
Custom room names   -> nameEnc
```

Hashed instead of encrypted:

```text
Account passwords   -> bcrypt hash
Demo password       -> bcrypt hash supported
Admin setup secret  -> bcrypt hash supported
Room passwords      -> bcrypt hash
Username lookup     -> HMAC-SHA256 lookup hash
```

## Admin setup

For local testing, log in, open **Admin access**, and enter:

```text
TSN-Admin!ChangeMe-2026
```

For Render, set your own:

```env
TSN_ADMIN_SETUP_PASSWORD=your-admin-password
```

More secure option:

```bash
npm run hash-secret -- "YourStrongPassword!2026"
```

Then set:

```env
TSN_ADMIN_SETUP_PASSWORD_HASH=<paste hash here>
```

## Project structure

```text
server.js                    Express + Socket.IO backend
public/index.html            Front-end HTML
public/app.js                Front-end app logic
public/styles.css            Design
scripts/hash-secret.js       Creates bcrypt hashes
scripts/backup-db.js         Backs up MongoDB or JSON database
scripts/restore-db.js        Restores MongoDB or JSON database
scripts/ping-self.js         Pings /api/ping for cron/monitor services
render.yaml                  Render Free + MongoDB Blueprint
render.free.yaml             Same as render.yaml, kept for clarity
render.persistent.yaml       Old paid-disk JSON fallback
render.cron.yaml             Optional paid Render Cron Job example
CRON_KEEP_AWAKE.md           Free external ping setup notes
MONGODB_RENDER_SETUP.md      Step-by-step MongoDB + Render setup
```
