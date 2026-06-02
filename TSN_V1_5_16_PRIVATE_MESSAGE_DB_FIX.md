# TSN V1.5.16 — Private Message db Fix

Fixed a backend crash:

```txt
ReferenceError: db is not defined
```

The private-message route now defines and uses `const db = req.db` before mapping messages through `publicMessage(...)`.

This prevents crashes that could happen after opening private chat or using GIF/photo media search.
