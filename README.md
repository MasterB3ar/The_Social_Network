# TSN V1.2.8

Denne version har et renere app-design med side-navigation:

- **Din profil**
- **Global chat** i midten
- **Privat chat**
- **Admin** kun synlig for admins

MongoDB Atlas, Render deployment, private beskeder, læsekvitteringer, rapporter, admin-dashboard, mobil-layout og 15-minutters “slet for alle” er stadig bevaret.

---

# TSN V1.2.6 — dansk safe beta

TSN V1.2.6 er en dansk social app med **globale opslag**, **likes**, **kommentarer**, **privat chat**, læsekvitteringer, sletning af egne private chats, 15-minutters slet-for-alle på private beskeder og sikkerheds-/moderationsfunktioner.


## Nyt i V1.2.6

- Du kan nu slette en privat chat for dig selv. Den bliver skjult fra din konto, men slettes ikke automatisk hos den anden person.
- Læsekvitteringer i private beskeder: dine beskeder viser **Sendt** eller **Læst**.

- Dublet-profiler bliver nu automatisk fundet og flettet sammen ved serverstart.
- TSN beholder den rigtige profil og fjerner kun de ekstra dublet-profiler.
- Opslag, kommentarer, likes, private beskeder, rapporter og rum-ejerskab fra dubletter bliver flyttet over til den profil, der bliver beholdt.
- Opret-konto flowet har fået en lås og ekstra kontrol, så samme brugernavn ikke kan oprettes to gange ved hurtige/dobbelte klik.
- Private chat-listen filtrerer også dubletter væk i UI'et som ekstra sikkerhed.

## Nyt i V1.2.2

- Beskedmoderation er gjort hurtigere ved at indlæse beskeder i bidder i stedet for alt på én gang.
- Beskedmoderation har nu en fast intern scrollbar, så beskeder ikke bliver klemt sammen med resten af dashboardet.
- Lange beskeder får deres egen lille scroll inde i kortet, så layoutet ikke bliver ødelagt.

## Nyt i V1.2

- Rapporteringssystem for globale opslag
- Rapporteringssystem for globale kommentarer
- Rapporteringssystem for private beskeder
- Rapporteringssystem for brugere
- Admin-dashboard til rapporter
- Admin kan markere rapporter som løst eller genåbne dem
- Admin kan håndhæve rapporter ved at slette rapporteret indhold eller banne rapporterede brugere
- Brugere kan slette deres egen konto
- Regler/sikkerhedspanel i appen
- Globale opslag og kommentarer vises med nyeste først
- MongoDB Atlas og Render fungerer stadig

## Hvad er stadig med?

- Dansk brugerflade
- Login og opret konto
- Globale opslag for alle brugere
- Likes på globale opslag
- Klik-ind visning for hvert globalt opslag
- Kommentarer inde på det enkelte globale opslag
- Privat 1-til-1 chat
- Ulæste private beskeder
- Admin-panel med bruger-moderation
- Admin-visning til at gennemgå og slette globale opslag, kommentarer og private beskeder
- MongoDB Atlas support
- Render deployment support
- Cron/keep-awake support via `/api/ping`
- Krypteret lagring af brugerdata og beskeder
- Ingen guest/demo-brugere

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

Når `MONGODB_URI` er sat, gemmer TSN brugere, beskeder, globale opslag og rapporter i MongoDB i stedet for en lokal JSON-fil.

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

Som admin kan du:

- Smide brugere ud
- Banne/fjerne ban
- Oprette database-backup
- Gennemgå/slette beskeder
- Gennemgå rapporter
- Slette rapporteret indhold
- Banne rapporterede brugere

## Rapporter

Brugere kan trykke **Rapportér** på:

- Globale opslag
- Kommentarer
- Private beskeder
- Brugere i privat chat

Rapporter gemmes i databasen og kan ses i admin-panelet. Rapportgrund gemmes krypteret ligesom andet følsomt tekstindhold.

## Slet konto

Brugere kan slette deres egen konto fra venstre profilpanel. Det sletter:

- Kontoen
- Brugerens globale opslag
- Brugerens kommentarer
- Brugerens likes
- Private beskeder til/fra brugeren
- Rapporter relateret til brugeren

## Cron / keep-awake

`/api/ping` kan bruges af en ekstern cron-service:

```text
https://dit-tsn-site.onrender.com/api/ping
```

Se også `CRON_KEEP_AWAKE.md`.

## Gamle features

Det gamle feed/posts/rooms-system er stadig deaktiveret. De globale opslag bruger den lette global-chat-database, men har nu likes, klik-ind kommentarvisning og rapportering. De gamle API-ruter returnerer `410`, fordi TSN V1.2 er fokuseret på globale opslag, privat chat og moderation.

## TSN V1.2.7 - mobile-only design polish

This update improves the phone layout without changing the laptop/desktop layout. The mobile improvements are scoped with CSS media queries, mainly for screens under 780px wide.

Added mobile improvements:
- Better spacing and card sizing on phones
- Cleaner top navigation on small screens
- Better global post/comment sizing
- Private chat modal fits phone screens better
- Scrollable user list, admin lists, report lists, and message moderation panels
- Larger tap targets for buttons and inputs
- iOS-friendly input sizing to avoid zoom on focus

## TSN V1.2.10 - TSN Stock standalone support

This TSN version does not show TSN Stock inside the main TSN app. TSN Stock is now meant to run as a separate website.

The original TSN server exposes a safe public data endpoint for the standalone TSN Stock site:

```txt
GET /api/public/stock
```

This endpoint returns only a fictional TSN Stock snapshot and aggregated activity metrics:

- online users count
- messages per hour count
- global posts per hour count
- price, change, trend and history

It does not expose passwords, sessions, private message text, user emails, or private account data.

Deploy this original TSN project first. Then deploy the separate `tsn-stock-standalone` project and set `TSN_API_BASE_URL` to your original TSN Render URL.
