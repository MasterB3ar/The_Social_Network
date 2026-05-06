# MongoDB + Render setup til TSN

## 1. Opret MongoDB Atlas

1. Gå til MongoDB Atlas.
2. Opret et gratis cluster.
3. Opret en database user med adgangskode.
4. Gå til **Network Access** og tillad Render/IP-adgang.
5. Kopiér connection string.

Den ligner cirka:

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

## 2. Sæt Environment Variables i Render

I din Render Web Service skal du sætte:

```env
NODE_ENV=production
MONGODB_URI=din_mongodb_connection_string
MONGODB_DB_NAME=tsn
MONGODB_STATE_COLLECTION=app_state
MONGODB_STATE_ID=main
JWT_SECRET=lang_tilfældig_secret
TSN_DATA_ENCRYPTION_KEY=anden_lang_tilfældig_secret
TSN_ADMIN_SETUP_PASSWORD=din_admin_setup_adgangskode
TSN_CONTENT_FILTER_ENABLED=true
```

## 3. Deploy

Brug:

```bash
Build Command: npm cache clean --force && npm install --omit=dev --no-audit --no-fund --prefer-online
Start Command: npm start
```

## 4. Test

Åbn:

```text
https://dit-tsn-site.onrender.com/api/health
```

Hvis MongoDB virker, skal `storage.mode` være `mongodb`.

## Vigtigt

Skift ikke `TSN_DATA_ENCRYPTION_KEY`, når appen allerede har rigtige brugere eller beskeder. Den nøgle bruges til at læse krypteret data.
