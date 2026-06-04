# TSN V1.5.34 — Video Call Polish

Denne opdatering polerer video-UI’et i TSN-opkald.

## Ændringer

- Tilføjet pæne video-state klasser til lokal og fjern video.
- Tilføjet `remoteCallVideoBox` og `localCallVideoBox` i call UI’et.
- Tilføjet labels til kamera-til/kamera-fra tilstande.
- Fjern video vises som hovedvideo i pop-out view.
- Egen video vises som picture-in-picture nederst i højre hjørne.
- Kamera-fra tilstand bruger nu avatar/placeholder i stedet for en grim sort/tom videoboks.
- Lokalt kamera preview spejles.
- Video bruger `object-fit: cover`, så billedet ikke bliver strukket eller klemt.
- Når kamera tændes midt i et lydopkald, popper opkaldet automatisk frem.
- Bundbjælken skjuler video-preview, så den forbliver ren og kompakt.

## Ændrede filer

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`
