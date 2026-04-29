# Deploy TSN on Render

This project is ready to deploy to Render as a Node.js web service.

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

Important: free mode uses Render's temporary filesystem. Accounts, posts, layer unlocks, and messages can reset when the service restarts or redeploys.

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

## Deploy steps

1. Unzip the project.
2. Create a new GitHub repository.
3. Upload all project files to the repository.
4. Go to Render.
5. Click **New +**.
6. Choose **Blueprint**.
7. Connect your GitHub repository.
8. Render will read `render.yaml` automatically.
9. Fill the secret values that use `sync: false`.
10. Click **Apply** / **Deploy**.

## Required Render environment variables

Render will generate `JWT_SECRET` automatically from the Blueprint. You need to enter these manually:

```text
TSN_DEMO_PASSWORD=<strong demo account password>
TSN_LAYER_1_PASSWORD=<strong layer 1 password>
TSN_LAYER_2_PASSWORD=<strong layer 2 password>
TSN_LAYER_3_PASSWORD=<strong layer 3 password>
```

Use long passwords with uppercase, lowercase, numbers, and symbols.

Example format:

```text
TSN_DEMO_PASSWORD=TSN-Demo!replace-this-2026
TSN_LAYER_1_PASSWORD=TSN-L1!replace-this-2026
TSN_LAYER_2_PASSWORD=TSN-L2!replace-this-2026
TSN_LAYER_3_PASSWORD=TSN-L3!replace-this-2026
```

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
TSN_DEMO_PASSWORD=<strong demo password>
TSN_LAYER_1_PASSWORD=<strong layer 1 password>
TSN_LAYER_2_PASSWORD=<strong layer 2 password>
TSN_LAYER_3_PASSWORD=<strong layer 3 password>
```

Environment variables for paid persistent disk:

```text
NODE_ENV=production
NODE_VERSION=24.14.1
DATA_DIR=/var/data
JWT_SECRET=<generate a long random secret>
TSN_DEMO_PASSWORD=<strong demo password>
TSN_LAYER_1_PASSWORD=<strong layer 1 password>
TSN_LAYER_2_PASSWORD=<strong layer 2 password>
TSN_LAYER_3_PASSWORD=<strong layer 3 password>
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
