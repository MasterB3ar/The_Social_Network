# TSN V1.1 — dansk chat-only version

TSN er nu gjort enkel og dansk: appen har kun **globale opslag** og **privat chat**.

## Hvad er med?

- Dansk brugerflade
- Login og opret konto
- Globale opslag for alle brugere
- Likes på globale opslag
- Kommentarer på globale opslag
- Privat 1-til-1 chat
- Ulæste private beskeder
- Admin-panel med bruger-moderation
- Admin-visning til at gennemgå og slette globale opslag, kommentarer og private beskeder
- MongoDB Atlas support
- Render deployment support
- Cron/keep-awake support via `/api/ping`
- Krypteret lagring af brugerdata og beskeder

## Kør lokalt

```bash
npm install
cp .env.example .env
npm run dev
```

Åbn derefter:

```text
http://localhost:3000
```

## Brug MongoDB

Sæt denne environment variable enten i `.env` lokalt eller i Render:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
```

Når `MONGODB_URI` er sat, gemmer TSN brugere og beskeder i MongoDB i stedet for en lokal JSON-fil.

## Deploy på Render

Render bruger normalt:

```bash
Build Command: npm install
Start Command: npm start
```

Vigtige Environment Variables på Render:

```env
NODE_ENV=production
MONGODB_URI=din_mongodb_atlas_connection_string
JWT_SECRET=lang_tilfældig_secret
TSN_DATA_ENCRYPTION_KEY=anden_lang_tilfældig_secret
TSN_ADMIN_SETUP_PASSWORD=din_admin_setup_adgangskode
TSN_CONTENT_FILTER_ENABLED=true
```

Vigtigt: Skift ikke `TSN_DATA_ENCRYPTION_KEY`, når rigtige brugere/beskeder allerede findes, ellers kan gamle krypterede data ikke læses.

## Bliv admin

1. Log ind på TSN.
2. Gå til admin-boksen i venstre side.
3. Indtast værdien fra `TSN_ADMIN_SETUP_PASSWORD`.
4. Din konto får admin-rettigheder.

## Cron / keep-awake

`/api/ping` kan bruges af en ekstern cron-service:

```text
https://dit-tsn-site.onrender.com/api/ping
```

Se også `CRON_KEEP_AWAKE.md`.

## Gamle features

Det gamle feed/posts/rooms-system er stadig deaktiveret. De globale opslag bruger den lette global-chat-database, men har nu likes og kommentarer. De gamle API-ruter returnerer `410`, fordi TSN V1.1 kun understøtter globale opslag og privat chat.
