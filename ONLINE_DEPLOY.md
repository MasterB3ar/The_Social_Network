# Deploy TSN on Render

This project is ready to deploy to Render as a Node.js web service.

## Security model in this version

- Account passwords are bcrypt-hashed in the database.
- Usernames, names, emails, and bios are AES-256-GCM encrypted in the database.
- Posts, comments, private chat messages, and layer-board posts are AES-256-GCM encrypted in the database.
- Username/email login uses HMAC lookup hashes, so the app can find accounts without storing plain usernames/emails.
- Demo and layer passwords can be stored on Render as bcrypt hashes.
- Legacy plaintext fields from older TSN versions are automatically encrypted when the server starts.

Do not change `TSN_DATA_ENCRYPTION_KEY` after users exist. Old encrypted profile fields, posts, comments, messages, and layer posts depend on it.

## Best option for testing: free Render web service

Use the included `render.yaml`.

This is the fastest option and should work for testing the website with friends. It uses:

```text
Runtime: Node
Plan: free
Region: frankfurt
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
DATA_DIR=/tmp/tsn-data
```

Important: free mode uses Render's temporary filesystem. Accounts, encrypted posts/comments, layer unlocks, encrypted profiles, and encrypted messages can reset when the service restarts or redeploys.

## Best option for saved accounts/messages: persistent disk

Use `render.persistent.yaml` instead.

1. Delete or rename the normal `render.yaml`.
2. Rename `render.persistent.yaml` to `render.yaml`.
3. Deploy using Render Blueprint.

This uses:

```text
Plan: starter
Disk mount path: /var/data
Disk size: 1 GB
DATA_DIR=/var/data
```

Persistent disks require a paid Render web service instance.

## Generate hashed layer/demo secrets

Run this locally for each demo/layer password:

```bash
npm install
npm run hash-secret -- "YourStrongSecretPassword!2026"
```

The command prints a bcrypt hash. Paste the hash into Render, not the real password.

Generate one hash for each of these:

```text
TSN_DEMO_PASSWORD_HASH
TSN_LAYER_1_PASSWORD_HASH
TSN_LAYER_2_PASSWORD_HASH
TSN_LAYER_3_PASSWORD_HASH
```

Keep the real Layer 1/2/3 passwords somewhere safe, because people still need to type the real passwords into the website.

## Deploy steps

1. Unzip the project.
2. Create a new GitHub repository.
3. Upload all project files to the repository.
4. Generate your demo/layer password hashes.
5. Go to Render.
6. Click **New +**.
7. Choose **Blueprint**.
8. Connect your GitHub repository.
9. Render will read `render.yaml` automatically.
10. Fill the secret values that use `sync: false`.
11. Click **Apply** / **Deploy**.

## Required Render environment variables

The Blueprint generates these automatically:

```text
JWT_SECRET
TSN_DATA_ENCRYPTION_KEY
```

You enter these manually:

```text
TSN_DEMO_PASSWORD_HASH=<bcrypt hash for demo password>
TSN_LAYER_1_PASSWORD_HASH=<bcrypt hash for layer 1 password>
TSN_LAYER_2_PASSWORD_HASH=<bcrypt hash for layer 2 password>
TSN_LAYER_3_PASSWORD_HASH=<bcrypt hash for layer 3 password>
```

Optional fallback if you do not want to generate hashes:

```text
TSN_DEMO_PASSWORD=<strong demo password>
TSN_LAYER_1_PASSWORD=<strong layer 1 password>
TSN_LAYER_2_PASSWORD=<strong layer 2 password>
TSN_LAYER_3_PASSWORD=<strong layer 3 password>
```

The hash variables are better because the real layer/demo passwords are not stored in Render.

## Manual Render setup, without Blueprint

Choose **New + → Web Service** and use:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Environment variables for free testing:

```text
NODE_ENV=production
NODE_VERSION=24.14.1
DATA_DIR=/tmp/tsn-data
JWT_SECRET=<generate a long random secret>
TSN_DATA_ENCRYPTION_KEY=<generate a different long random secret>
TSN_DEMO_PASSWORD_HASH=<bcrypt hash for demo password>
TSN_LAYER_1_PASSWORD_HASH=<bcrypt hash for layer 1 password>
TSN_LAYER_2_PASSWORD_HASH=<bcrypt hash for layer 2 password>
TSN_LAYER_3_PASSWORD_HASH=<bcrypt hash for layer 3 password>
```

Environment variables for paid persistent disk:

```text
NODE_ENV=production
NODE_VERSION=24.14.1
DATA_DIR=/var/data
JWT_SECRET=<generate a long random secret>
TSN_DATA_ENCRYPTION_KEY=<generate a different long random secret>
TSN_DEMO_PASSWORD_HASH=<bcrypt hash for demo password>
TSN_LAYER_1_PASSWORD_HASH=<bcrypt hash for layer 1 password>
TSN_LAYER_2_PASSWORD_HASH=<bcrypt hash for layer 2 password>
TSN_LAYER_3_PASSWORD_HASH=<bcrypt hash for layer 3 password>
```

Then add a disk:

```text
Mount path: /var/data
Size: 1 GB
```

## Test after deploy

Open the Render URL. It will look like:

```text
https://tsn-social-network.onrender.com
```

Then test chat:

1. Login as Demo User 1 in one browser.
2. Open a private/incognito window.
3. Login as Demo User 2.
4. Click the other user in the People list.
5. Send a message.

## Troubleshooting

### It says `Cannot find package.json`

Your GitHub repo probably has the project inside an extra folder. The repo root must contain:

```text
package.json
server.js
render.yaml
public/
```

### The service deploys but accounts disappear

You used the free config. Use the paid persistent-disk config, or later move TSN to PostgreSQL/MongoDB.

### Names, posts, comments, or messages show empty after changing secrets

You changed `TSN_DATA_ENCRYPTION_KEY` after data was created. Put the old key back, or reset the database.

### The service is unhealthy

Open the URL below in your browser:

```text
https://your-service-name.onrender.com/api/health
```

If storage is not ready, check `DATA_DIR` and whether the disk mount path matches it.

### Chat does not update live

Refresh both browser windows. Render supports normal Node web services and Socket.IO should work as long as the service is awake.

## Security before real public launch

Before real users join, disable public guest/demo login, add rate limiting, add password reset, add moderation/admin tools, and move from the JSON file database to PostgreSQL or MongoDB.
