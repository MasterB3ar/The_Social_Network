# TSN V1.3.2 — TSNM Market price update

This build keeps TSNM Market inside normal TSN, but makes cosmetics much more expensive. TSNM is still **only earned in TSN-S / TSN-Stock**.

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


## New V1.3.2 prices

- Neon Core: Free
- Midnight Bear: 1,000 TSNM
- Cyber Cat: 2,500 TSNM
- Gold Crown: 5,000 TSNM
- Fire Loop GIF: 3,500 TSNM
- Galaxy Spin GIF: 7,500 TSNM
- Matrix Rain GIF: 9,000 TSNM
- Thunder VIP GIF: 15,000 TSNM
