# TSN V1.5.12 — Private Chat Scroll Fix

Denne version retter en fejl, hvor privat chat nogle gange hoppede til toppen.

## Ændret

- Privat chat starter ved bunden, når en samtale åbnes.
- Privat chat bevarer scroll-positionen ved re-render, læsekvitteringer og beskedopdateringer.
- Hvis du er tæt på bunden, bliver du ved bunden når nye beskeder kommer.
- Hvis du læser ældre beskeder, bliver du ikke tvunget ned eller op.
- Media-load fra billeder/GIFs stabiliserer scroll-positionen.

## Environment variables

Ingen nye environment variables.
