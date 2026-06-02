# TSN V1.5.7 — WarnButton Picture Click Fix

This update fixes the remaining `warnButton is not defined` / `Can't find variable: warnButton` issue when clicking picture/media messages.

Changes:

- Added a defensive global fallback for old click-handler paths.
- Renamed the admin warning button variable to avoid leaking into message/media click code.
- Versioned the frontend script URL as `/app.js?v=1.5.7` so browsers reload the fixed JavaScript instead of keeping a stale cached file.
- No new environment variables.
