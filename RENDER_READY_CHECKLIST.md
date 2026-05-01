# TSN V1.1 Render + MongoDB checklist

Before going public:

- Create a MongoDB Atlas database and copy your connection string.
- In Render, set `MONGODB_URI`.
- Set strong values for `JWT_SECRET` and `TSN_DATA_ENCRYPTION_KEY`.
- Set `TSN_ADMIN_SETUP_PASSWORD` or preferably `TSN_ADMIN_SETUP_PASSWORD_HASH`.
- Keep `TSN_DATA_ENCRYPTION_KEY` unchanged after users/messages exist.
- Use `/api/health` to confirm `storage.mode` is `mongodb`.
- Use `/api/ping` with an external monitor if you want to reduce Render Free sleeping.

TSN V1.1 has only global chat and private chat in the UI.
