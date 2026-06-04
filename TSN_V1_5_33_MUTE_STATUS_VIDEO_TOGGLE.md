# TSN V1.5.33 — Mute Status + Video Toggle

## Nyt

- Live status for den anden persons mikrofon: `muted` eller `mikrofon til`.
- Live status for den anden persons kamera: `video til` eller `video fra`.
- Kamera kan nu tændes og slukkes midt i et stemmeopkald.
- Når kamera tændes i et stemmeopkald, sender klienten WebRTC-renegotiation via den eksisterende Socket.IO signaling.
- Bundbjælken viser nu media-status på en kompakt måde.

## Ændrede filer

- `public/app.js`
- `public/index.html`
- `public/styles.css`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`

## Test

- `node --check public/app.js`
- `node --check server.js`
- `unzip -t`
