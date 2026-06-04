# TSN V1.5.35 — Complete UI Redesign + Mobile

Denne version bygger videre på V1.5.34 og giver TSN et komplet nyt visuelt design med fokus på mobilvenlig brug.

## Ændret

- Nyt samlet dark/glass UI-design på login, topbar, navigation, chat, profil, admin, venner og aktivitet.
- Mobilnavigation er lavet som en fast bundbjælke med store trykflader.
- Global chat er gjort mere app-agtig med bedre beskedbobler, bedre inputfelt og mere stabil scroll-plads.
- Privat chat er redesignet og bliver fuldskærm på mobil, så den er nem at skrive i.
- Brugerlisten har nye kort, bedre statusvisning, tydeligere unread badges og bedre touch-layout.
- Knapper, inputs, modals, cards og badges har fået ens design-system.
- Opkaldsbjælken tager hensyn til mobilnavigationen, så den ikke ligger oven i bunden.
- Video-/opkaldspanel matcher nu resten af UI’et bedre.
- Safe-area support til iPhone er forbedret.
- Version/cache er opdateret til V1.5.35.

## Testet

- `node --check server.js`
- `node --check public/app.js`
- `unzip -t`
