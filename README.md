# TSN V1.3.1 — TSNM Market using TSN-S wallet only

This version implements **TSNM Market inside normal TSN**, but normal TSN does **not** create or reward TSNM.

Important rule:

> Users can only earn TSNM in **TSN-S / TSN-Stock**. Normal TSN only reads the shared TSN-S wallet balance and lets users spend TSNM on cosmetics.

## What is included

- New **TSNM Market** page in the TSN sidebar.
- Users can buy and equip:
  - profile pictures
  - animated GIF-style avatars
- Cosmetics are saved on the normal TSN account.
- Cosmetics show in:
  - profile
  - global posts
  - comments
  - private chat user list
  - private chat header
  - admin user list
- Normal TSN no longer gives:
  - starting TSNM
  - daily TSNM claims
  - TSNM for posts
  - TSNM for comments
  - TSNM for private messages
- Purchases are paid from the **TSN-S wallet collection**.

## Required setup for TSN-S wallet sharing

Normal TSN must be able to read the same MongoDB wallet database used by TSN-S / TSN-Stock.

If TSN and TSN-S use the same MongoDB Atlas connection, add these to normal TSN on Render:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn

TSNS_MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
TSNS_MONGODB_DATABASE=tsn_stock
TSNS_WALLET_COLLECTION=tsnMoneyWallets
```

If `TSNS_MONGODB_URI` is omitted, TSN falls back to `MONGODB_URI`, but you should still set `TSNS_MONGODB_DATABASE=tsn_stock` so it knows where TSN-S stores wallets.

## Render settings

Use:

```txt
Build Command: npm cache clean --force && npm install --omit=dev --no-audit --no-fund --prefer-online
Start Command: node server.js
```

Recommended env vars:

```env
NODE_ENV=production
NODE_VERSION=20.12.2

MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main

TSNS_MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
TSNS_MONGODB_DATABASE=tsn_stock
TSNS_WALLET_COLLECTION=tsnMoneyWallets

JWT_SECRET=<generate-a-long-random-secret>
TSN_DATA_ENCRYPTION_KEY=<generate-a-different-long-random-secret>
TSN_ADMIN_SETUP_PASSWORD=<your-admin-setup-password>
```

## API routes

Market routes in normal TSN:

```txt
GET  /api/market
POST /api/market/buy
POST /api/market/equip
```

The old daily-claim route exists only to reject old clients:

```txt
POST /api/market/claim-daily -> 403, because TSNM is earned only in TSN-S
```

## Deploy order

1. Deploy/update TSN-S / TSN-Stock first.
2. Confirm TSN-S wallet works and users can earn TSNM there.
3. Deploy this TSN version.
4. Make sure normal TSN has the `TSNS_*` env vars pointing at the TSN-S wallet database.
5. Log into normal TSN, open **TSNM Market**, and confirm the balance matches TSN-S.
