# Udgiv TSN online

## Render

1. Upload projektet til GitHub.
2. Opret en ny **Web Service** på Render.
3. Vælg dit GitHub repository.
4. Sæt:

```bash
Build Command: npm cache clean --force && npm install --omit=dev --no-audit --no-fund --prefer-online
Start Command: npm start
```

5. Tilføj Environment Variables fra `.env.render.example`.
6. Deploy.

## MongoDB anbefales

Brug MongoDB Atlas, så data ikke forsvinder ved deploys/restarts.

Minimum:

```env
MONGODB_URI=...
JWT_SECRET=...
TSN_DATA_ENCRYPTION_KEY=...
TSN_ADMIN_SETUP_PASSWORD=...
```

## Tjek at siden virker

Åbn:

```text
https://dit-tsn-site.onrender.com/api/health
```

Derefter kan du åbne selve siden og oprette en bruger.
