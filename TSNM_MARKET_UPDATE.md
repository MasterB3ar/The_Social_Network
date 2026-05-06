# TSN V1.3.1 — TSNM Market update

This build adds TSNM Market into normal TSN, but TSNM is **only earned in TSN-S / TSN-Stock**.

## Changed from V1.3.0

Removed all TSNM generation from normal TSN:

- No starting TSNM in normal TSN.
- No daily TSNM claim in normal TSN.
- No TSNM reward for global posts.
- No TSNM reward for comments.
- No TSNM reward for private messages.

Normal TSN now reads/spends the shared TSN-S wallet balance through MongoDB.

## New/important env vars

```env
TSNS_MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
TSNS_MONGODB_DATABASE=tsn_stock
TSNS_WALLET_COLLECTION=tsnMoneyWallets
```

If `TSNS_MONGODB_URI` is empty, normal TSN will try to use `MONGODB_URI`.

## Routes

```txt
GET  /api/market
POST /api/market/buy
POST /api/market/equip
```

`POST /api/market/claim-daily` intentionally returns `403` because TSNM must only be earned in TSN-S.
