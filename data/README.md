# Data folder

This folder is intentionally not used for live production data by default.

Recommended online storage is MongoDB Atlas via:

```env
MONGODB_URI=...
```

If MongoDB is not configured, TSN uses a JSON database outside the project folder by default:

```text
~/.tsn-social-network/db.json
```

Do not commit a live `db.json` file to GitHub.
