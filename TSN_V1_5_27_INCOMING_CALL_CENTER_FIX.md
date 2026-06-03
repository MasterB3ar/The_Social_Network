# TSN V1.5.27 — Incoming Call Center Fix

This update forces the incoming call popup to appear in the exact center of the screen.

## Fixed

- Incoming calls no longer appear in the corner/bottom layout.
- The call modal uses a high-z-index full-screen centered overlay.
- Accept/decline buttons remain visible and easy to press.
- `index.html` now loads `/app.js?v=1.5.27` to avoid stale cached JS.
