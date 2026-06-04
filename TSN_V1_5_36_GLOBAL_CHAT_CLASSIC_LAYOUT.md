# TSN V1.5.36 — Global Chat Classic Layout Fix

## Formål

V1.5.35 ændrede global chat for meget visuelt. Denne version gendanner den gamle, fungerende global-chat-opsætning, men beholder et friskere design.

## Ændret

- Global chat er tilbage til klassisk chat-first layout.
- Beskedlisten har igen normal højde og scroll.
- Beskeder vises igen med avatar + boble.
- Egne beskeder vises igen til højre.
- Inputfeltet ligger stabilt under beskedlisten.
- Mobil-layoutet er rettet, så chatten ikke bliver for bred, for mast eller gemmer knapperne.
- Det nye V1.5.35 dark/glass design beholdes på resten af siden.

## Test

- `node --check server.js`
- `node --check public/app.js`
- `unzip -t`
