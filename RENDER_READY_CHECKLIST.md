# TSN Render-ready checklist

Before deploying:

- [ ] Project files are at the root of your GitHub repo.
- [ ] `package.json` is in the root.
- [ ] `server.js` is in the root.
- [ ] `render.yaml` is in the root.
- [ ] You changed `TSN_DEMO_PASSWORD`.
- [ ] You changed all 3 layer passwords.
- [ ] You are using free mode only for testing.
- [ ] You are using `render.persistent.yaml` if you need saved data.

After deploying:

- [ ] Open `/api/health` and check it returns `ok: true`.
- [ ] Create a normal account.
- [ ] Test Demo User 1 + Demo User 2 chat in two browser windows.
- [ ] Test Layer 1 → Layer 2 → Layer 3 unlock order.
