# Deploy TSN V1.0 to Render without wiping data

This TSN version is Render-ready and uses persistent storage for accounts, posts, passwords, chats, rooms, and encrypted profiles.

## Why data was getting deleted

TSN stores its database in a JSON file. If that JSON file lives inside the deployed app folder, it can be replaced when you upload a new version. On Render, free web services also use an ephemeral filesystem, meaning filesystem changes can be lost after restarts or deploys.

The fix in this version is:

```text
DATA_DIR=/var/data
```

with a Render persistent disk mounted at:

```text
/var/data
```

## Before deploying

Create strong values for:

```env
JWT_SECRET=<long random secret>
TSN_DATA_ENCRYPTION_KEY=<different long random secret>
TSN_DEMO_PASSWORD_HASH=<bcrypt hash>
TSN_ADMIN_SETUP_PASSWORD_HASH=<bcrypt hash>
```

Generate hashes locally:

```bash
npm install
npm run hash-secret -- "YourStrongDemoPassword!2026"
npm run hash-secret -- "YourStrongAdminPassword!2026"
```

Do **not** change `TSN_DATA_ENCRYPTION_KEY` after real users/messages exist.

## Recommended Render deploy

1. Unzip the project.
2. Upload the **contents** of the `tsn-social-network` folder to GitHub.
3. Go to Render.
4. Click **New +**.
5. Choose **Blueprint**.
6. Connect the GitHub repo.
7. Render reads `render.yaml`.
8. Render creates a paid Starter service with a persistent disk at `/var/data`.
9. Add the secret environment variables when Render asks.
10. Deploy.

The included `render.yaml` is the persistent version.

## Manual Render Web Service settings

Use these if you do not use Blueprint:

```text
Runtime: Node
Plan: Starter or higher
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Disk mount path: /var/data
Disk size: 1 GB
```

Environment variables:

```env
NODE_ENV=production
NODE_VERSION=24.14.1
DATA_DIR=/var/data
JWT_SECRET=<generate>
TSN_DATA_ENCRYPTION_KEY=<generate>
TSN_DEMO_PASSWORD_HASH=<bcrypt hash>
TSN_ADMIN_SETUP_PASSWORD_HASH=<bcrypt hash>
TSN_CONTENT_FILTER_ENABLED=true
TSN_BLOCKED_WORDS=
```

## Free testing only

If you want free testing, rename:

```text
render.free.yaml
```

to:

```text
render.yaml
```

But do not use that for a real site, because it uses:

```env
DATA_DIR=/tmp/tsn-data
```

and data can reset.

## Updating TSN on Render

1. Do **not** delete the Render disk.
2. Do **not** change `DATA_DIR=/var/data`.
3. Do **not** change `TSN_DATA_ENCRYPTION_KEY`.
4. Push the new code to GitHub.
5. Render redeploys.
6. Accounts/posts/chats/rooms stay in `/var/data/db.json`.

## Local backup before large updates

```bash
npm run backup
```

Restore if needed:

```bash
npm run restore -- /full/path/to/db-backup.json
```

## Health check

Open:

```text
https://your-render-url.onrender.com/api/health
```

Check that it shows:

```text
dataDir: /var/data
```

If it shows `/tmp/tsn-data`, your service is still using free temporary storage.
