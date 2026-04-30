# TSN V1.0

A full-stack social media starter app with accounts, public posts, private chat, **7 shared rooms that users can claim, rename, and optionally password-protect**, admin moderation including an all-message review view, server-side content filtering, public bios, encrypted-at-rest storage, and update-safe persistent data.

## Main features

- Username login, guest login, and demo login
- Simple account passwords allowed: 4+ characters, so `1234` works if a user wants that
- Public feed with posts, comments, likes, and user-owned delete controls
- Private real-time chat with Socket.IO
- Message threads keep their scroll position when new messages arrive, so they do not jump to the top
- Red unread-message badges for direct messages
- 7 TSN Rooms:
  - default room names are only `Room 1`, `Room 2`, `Room 3`, etc.
  - anyone can enter and chat in rooms with no password
  - unclaimed rooms can be claimed by one user
  - room owners/admins can rename claimed rooms
  - room owners/admins can add, change, or remove an optional room password
  - room passwords are hashed, not stored as readable text
  - the room owner, message author, or an admin can delete room messages
  - room owners/admins can release claimed rooms, which resets the name, removes the password, and deletes all messages in that room
- Public user bios in People/search/chat
- Admin tools:
  - claim admin with a server-side setup password
  - delete posts, comments, private messages, and room messages
  - review all stored messages in one admin-only view: feed posts, comments, private direct messages, open room messages, and password-room messages
  - kick, ban, and unban accounts
  - create a server-side database backup
- Server-side blocked-language filter
- Render-ready deployment files
- Persistent database location so updates do **not** wipe accounts/posts/messages


## Admin message review

When you claim admin rights, TSN shows an **All messages** panel in the middle feed area. It can load and search:

```text
Feed posts
Feed comments
Private direct messages
Open room messages
Password-protected room messages
```

Admins can delete items directly from this panel. Messages are still encrypted at rest in the database, but the server decrypts them for admin moderation. For transparency, the login page tells users that admins can review messages for safety/moderation.

## Important data-storage change

Older TSN versions stored the live database here:

```text
./data/db.json
```

That is bad for updates, because replacing the project folder or redeploying can overwrite it.

This version stores the live database outside the app code by default:

```text
~/.tsn-social-network/db.json
```

Backups are saved here:

```text
~/.tsn-social-network/backups
```

On first start, if this version finds an older `./data/db.json` with real user data, it automatically copies it into the persistent data folder.

## Render persistence

The included `render.yaml` now uses a persistent disk:

```text
DATA_DIR=/var/data
```

That is the correct setup for long-term accounts, posts, passwords, chats, and rooms.

Render free services use an ephemeral filesystem, so data can disappear after restarts or deploys. For free testing only, use:

```text
render.free.yaml
```

For a real TSN site, use the normal `render.yaml`.

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

Important: do **not** change `TSN_DATA_ENCRYPTION_KEY` after people have created accounts or messages. Login and encrypted messages depend on that key. If you accidentally changed it and still know the old key, set `TSN_OLD_DATA_ENCRYPTION_KEYS=old-key-here` so TSN can read old accounts and repair username lookup on login.

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

For the safest local setup, leave `DATA_DIR` unset in `.env`. Then TSN uses:

```text
~/.tsn-social-network/db.json
```

## Backup and restore

Create a manual backup:

```bash
npm run backup
```

Restore a backup:

```bash
npm run restore -- /full/path/to/db-backup.json
```

The server also makes an automatic backup before startup migration when it detects existing user data.

## Updating TSN without wiping data

1. Stop the server.
2. Run:

```bash
npm run backup
```

3. Replace the app code with the new version.
4. Keep your old `.env` secrets, especially `TSN_DATA_ENCRYPTION_KEY`. Do not replace it with the value from the new `.env.example`.
5. Start the server again:

```bash
npm install
npm start
```

Do not copy a new empty `data/db.json` over your live database. This version no longer includes a live `data/db.json` file.

## Login troubleshooting

If login stops working immediately after an update, check these first:

```text
1. Make sure your old database was not replaced.
2. Make sure your old TSN_DATA_ENCRYPTION_KEY is still the same.
3. If you changed the key but still know the old one, add:
   TSN_OLD_DATA_ENCRYPTION_KEYS=your-old-key
4. Restart the server and try logging in again.
```

New accounts are still protected with bcrypt password hashes. Usernames/messages remain encrypted at rest.

## Local defaults

Demo account password:

```text
TSN-Demo!9vK2p-Q8rM
```

Admin setup password:

```text
TSN-Admin!ChangeMe-2026
```

For local testing, log in, open **Admin access**, and enter the admin setup password.

## More secure demo/admin secrets

Generate bcrypt hashes:

```bash
npm run hash-secret -- "YourStrongPassword!2026"
```

Then use:

```env
TSN_DEMO_PASSWORD_HASH=<paste hash here>
TSN_ADMIN_SETUP_PASSWORD_HASH=<paste hash here>
```

On Render, prefer the hash variables instead of real password variables.

## Project structure

```text
server.js                  Express + Socket.IO backend
public/index.html          Front-end HTML
public/app.js              Front-end app logic
public/styles.css          Design
scripts/hash-secret.js     Creates bcrypt hashes for Render secrets
scripts/backup-db.js       Backs up the live database
scripts/restore-db.js      Restores a database backup
render.yaml                Render config with persistent disk
render.free.yaml           Free testing config, data can reset
data/README.md             Explains why live data is not stored in the project
```

## Login Fix Note

This build fixes a bug where TSN could show “Logged in” but stay on the login screen if a non-auth app data load failed during startup. Authentication now loads first, then feed/users/rooms load separately so the user stays logged in.


## V1.0 comment/message spacing fix

This build fixes a layout bug where messages/comments could look squeezed together after new activity. Direct messages, comments, room messages, and admin message rows now keep their own spacing and wrap long text cleanly.
