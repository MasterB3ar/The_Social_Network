# TSN Render-ready checklist

Before deploying:

- [ ] Project files are at the root of your GitHub repo.
- [ ] `package.json` is in the root.
- [ ] `server.js` is in the root.
- [ ] `render.yaml` is in the root.
- [ ] `JWT_SECRET` is set or generated.
- [ ] `TSN_DATA_ENCRYPTION_KEY` is set or generated.
- [ ] You generated a hash for `TSN_DEMO_PASSWORD_HASH`.
- [ ] You generated hashes for all 3 layer password hash variables.
- [ ] You saved the real Layer 1/2/3 passwords somewhere safe.
- [ ] You are using free mode only for testing.
- [ ] You are using `render.persistent.yaml` if you need saved data.

Generate a hash:

```bash
npm run hash-secret -- "YourStrongSecretPassword!2026"
```

After deploying:

- [ ] Open `/api/health` and check it returns `ok: true`.
- [ ] Create a normal account.
- [ ] Log in with username and password.
- [ ] Test Demo User 1 + Demo User 2 chat in two browser windows.
- [ ] Test Layer 1 → Layer 2 → Layer 3 unlock order.
- [ ] Check the JSON database and confirm usernames are stored as `usernameEnc` + `usernameHash`.
- [ ] Check that posts/comments/layer posts use `bodyEnc`, not plain `body`.
- [ ] Check that private messages use `textEnc`, not plain `text`.
