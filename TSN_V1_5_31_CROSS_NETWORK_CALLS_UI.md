# TSN V1.5.31 — Cross-Network Calls + Better Call UI

Denne version forbedrer TSN-opkald, så de kan bruges mellem brugere på forskellige netværk.

## Ændret

- WebRTC bruger nu server-leveret ICE-konfiguration via `/api/call-config`.
- Public STUN er aktiv som standard.
- TURN kan sættes med `TSN_TURN_URLS`, `TSN_TURN_USERNAME` og `TSN_TURN_CREDENTIAL`.
- `TSN_ICE_SERVERS_JSON` kan bruges til avanceret fuld ICE-konfiguration.
- ICE-candidates bliver nu bufferet, hvis de kommer før peer connection/remote description er klar. Det retter mange opkaldsfejl udenfor samme Wi-Fi.
- Opkalds-timeout er ændret fra 10 sekunder til 30 sekunder.
- Call UI er opgraderet med timer, netværksstatus, call type badge, forbindelsesstatus og Udvid/Minimer.
- Mikrofon/kamera bruger echo cancellation, noise suppression og auto gain control.

## Render environment variables til stabile cross-network opkald

```txt
TSN_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302
TSN_TURN_URLS=turn:your-turn-host:3478,turns:your-turn-host:5349
TSN_TURN_USERNAME=your-turn-username
TSN_TURN_CREDENTIAL=your-turn-password
```

Public STUN kan forbinde mange brugere på forskellige netværk, men TURN er nødvendig for de svære tilfælde, fx streng NAT, mobilnet eller skole-/arbejdsnetværk.
