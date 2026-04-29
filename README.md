# The Social Network (TSN)

A full-stack social media starter app with accounts, encrypted profiles, encrypted posts/comments, encrypted private chat messages, encrypted layer-board posts, and 3 password-gated deeper layers.

## Features

- Register/login accounts
- Username-or-email login
- Guest and demo login for testing
- Account passwords are stored as bcrypt hashes
- User identity fields are encrypted at rest with AES-256-GCM
  - `nameEnc`
  - `usernameEnc`
  - `emailEnc`
  - `bioEnc`
- User-generated content is encrypted at rest with AES-256-GCM
  - post bodies use `bodyEnc`
  - comment bodies use `bodyEnc`
  - private chat messages use `textEnc`
  - layer-board posts use `bodyEnc`
- Login/search lookup uses non-reversible HMAC hashes instead of plain usernames/emails
  - `usernameHash`
  - `emailHash`
- Optional bcrypt-hashed demo/layer secrets for Render
- Strong account password rules
- Public feed with posts, likes, and comments
- User profiles and bios
- People search
- Online/offline presence
- Realtime private chat with Socket.IO
- 3 deeper password-gated layers
- Private post board inside each unlocked layer
- Render deployment files included

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

## Encryption and hashing

Important distinction:

- Account passwords are **hashed**, not encrypted. This is safer because the app never needs to read the original password again.
- Usernames, display names, emails, and bios are **encrypted** because the app needs to display them after login.
- Posts, comments, private chat messages, and layer-board messages are also **encrypted at rest**.
- Username/email login still works because TSN stores a non-reversible HMAC lookup hash.
- Legacy plaintext fields from older TSN versions are automatically migrated to encrypted fields on server startup.

Do not change `TSN_DATA_ENCRYPTION_KEY` after real users exist. If you change it, old encrypted usernames/names/emails/bios/posts/comments/messages cannot be decrypted.

## Default local passwords

Demo accounts:

```text
TSN-Demo!9vK2p-Q8rM
```

Layer passwords:

```text
Layer 1: TSN-Layer1!8qN4-vZ2m-R7tP
Layer 2: TSN-Layer2!5xC9-mH6a-B3yL
Layer 3: TSN-Layer3!2pW7-kD8s-N4rX
```

Change these in `.env` before sharing your site.

## More secure layer/demo secrets

Instead of storing real demo/layer passwords in Render, generate bcrypt hashes.

Example:

```bash
npm run hash-secret -- "MyStrongLayer1Password!2026"
```

Copy the printed hash into `.env` or Render:

```env
TSN_LAYER_1_PASSWORD_HASH=<paste-the-hash-here>
```

Do the same for:

```text
TSN_DEMO_PASSWORD_HASH
TSN_LAYER_1_PASSWORD_HASH
TSN_LAYER_2_PASSWORD_HASH
TSN_LAYER_3_PASSWORD_HASH
```

If a `*_PASSWORD_HASH` value is set, TSN uses it instead of the plain `*_PASSWORD` value.

## Deploy on Render

This project includes two Render Blueprint files:

```text
render.yaml               Free testing deploy
render.persistent.yaml    Paid deploy with saved data on a persistent disk
```

### Free testing deploy

Use the included `render.yaml` as-is.

It uses:

```text
Runtime: Node
Plan: free
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
DATA_DIR=/tmp/tsn-data
```

This is easy and good for testing. Data can reset after restarts or redeploys.

### Saved-data deploy

Use this if you want accounts, encrypted messages, encrypted posts/comments, encrypted profiles, encrypted layer posts, and layer unlocks to survive restarts.

1. Rename `render.persistent.yaml` to `render.yaml`.
2. Deploy with Render Blueprint.
3. Use the Starter plan with a disk mounted at `/var/data`.

It uses:

```text
Plan: starter
Disk mount path: /var/data
DATA_DIR=/var/data
```

Persistent disks require a paid Render service.

## Required Render secrets

Render generates these automatically from the Blueprint:

```text
JWT_SECRET
TSN_DATA_ENCRYPTION_KEY
```

You need to enter these manually. Use bcrypt hashes, not the real passwords:

```text
TSN_DEMO_PASSWORD_HASH=<bcrypt hash>
TSN_LAYER_1_PASSWORD_HASH=<bcrypt hash>
TSN_LAYER_2_PASSWORD_HASH=<bcrypt hash>
TSN_LAYER_3_PASSWORD_HASH=<bcrypt hash>
```

Keep the original real layer passwords somewhere safe, because users must still type the real passwords to unlock each layer.

## Project files

```text
server.js                  Express + Socket.IO API server
public/index.html          Front-end layout
public/styles.css          Styling
public/app.js              Front-end behavior
scripts/hash-secret.js     Bcrypt hash generator for demo/layer secrets
render.yaml                Free Render Blueprint
render.persistent.yaml     Paid persistent-disk Render Blueprint
ONLINE_DEPLOY.md           Full Render deploy guide
RENDER_READY_CHECKLIST.md  Quick checklist
.env.example               Local environment example
.env.render.example        Render environment example
data/db.json               Local JSON database
```

## Test chat

1. Open the site normally and click **Demo User 1**.
2. Open the site in private/incognito mode and click **Demo User 2**.
3. Click the other user in the People panel.
4. Send messages.

## Health check

Open:

```text
/api/health
```

It should return `ok: true` and include the encrypted storage status for profiles, posts, comments, messages, and layer posts.

## Important before real public launch

This app uses a JSON file database to stay simple. That is okay for testing and learning. Before real public use, move the database to PostgreSQL or MongoDB, disable/protect guest/demo login, add rate limiting, add password reset, add moderation/admin tools, and add proper key rotation/backups.
