# TSN Render-ready checklist

## Must be true before real users join

- [ ] `DATA_DIR=/var/data`
- [ ] A Render persistent disk is attached at `/var/data`
- [ ] You are using `render.yaml`, not `render.free.yaml`
- [ ] `JWT_SECRET` is set
- [ ] `TSN_DATA_ENCRYPTION_KEY` is set
- [ ] `TSN_DATA_ENCRYPTION_KEY` is saved somewhere safe and will not be changed
- [ ] If the encryption key was changed by mistake, `TSN_OLD_DATA_ENCRYPTION_KEYS` contains the old key
- [ ] `TSN_DEMO_PASSWORD_HASH` is set
- [ ] `TSN_ADMIN_SETUP_PASSWORD_HASH` is set
- [ ] `/api/health` shows `dataDir: /var/data`
- [ ] You have created your admin account and claimed admin rights
- [ ] You have tested post/comment/chat/rooms after a redeploy

## Local update checklist

- [ ] Stop TSN
- [ ] Run `npm run backup`
- [ ] Keep your `.env`
- [ ] Keep the same `TSN_DATA_ENCRYPTION_KEY`
- [ ] Update the code
- [ ] Run `npm install`
- [ ] Run `npm start`
- [ ] Confirm old accounts/posts/messages still exist

## Important warnings

Do not store the live database in:

```text
./data/db.json
```

Do not use this for a real public Render site:

```text
DATA_DIR=/tmp/tsn-data
```

Do not change this after users create data:

```text
TSN_DATA_ENCRYPTION_KEY
```

## Backup commands

Create backup:

```bash
npm run backup
```

Restore backup:

```bash
npm run restore -- /full/path/to/db-backup.json
```


## TSN V1.0 admin message review

Admins can review all stored feed posts, comments, direct messages, and room messages, including password-protected rooms. Messages remain encrypted at rest and are decrypted server-side only for authorized admin moderation. The login screen includes a moderation notice for users.

## Login Fix Note

This build fixes a bug where TSN could show “Logged in” but stay on the login screen if a non-auth app data load failed during startup. Authentication now loads first, then feed/users/rooms load separately so the user stays logged in.
