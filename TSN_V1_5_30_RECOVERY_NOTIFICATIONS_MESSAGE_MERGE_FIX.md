# TSN V1.5.30 — Recovery Notifications + Message Merge Fix

Denne version bygger videre på V1.5.29 og retter to ting i kontogendannelse/sammenlægning:

1. Admin får nu en tydelig dansk notifikation, når en bruger sender en kontogendannelsesanmodning.
2. Private beskeder fra den midlertidige konto bliver flyttet korrekt over på den gamle konto, når brugeren bekræfter sammenlægningen.

Eksempel:
- User01 har glemt adgangskoden.
- User02 bliver oprettet som midlertidig konto.
- User02 skriver til Bo.
- User02 får godkendt gendannelse og logger ind på User01.
- Når User01 trykker Fortsæt i sammenlægningspopupen, bliver samtalen flyttet fra User02 til User01.
- Bo ser nu beskeden i chatten med User01.
- Under beskeder, som oprindeligt blev skrevet af User02, står der: “Overført besked fra den gamle konto User02”.
- User01 kan også se de tidligere beskeder i samtalen.

Teknisk:
- `conversationId` bliver genberegnet efter merge, så beskederne ligger i den rigtige private samtale.
- `from`, `to` og `readBy` bliver remappet fra den midlertidige konto til den gamle konto.
- Beskeder sendt af den midlertidige konto får en dansk `transferNote`.
- Modparter i berørte samtaler får et socket-event, så brugerlisten/chatten kan opdatere uden manuel refresh.
