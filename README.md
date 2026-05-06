# TSN V1.3.6 — Global chat scroll fix

This version removes the TSN shop/currency system from normal TSN.

## Changed

- Removed the shop page from the sidebar.
- Removed the user balance display from profiles.
- Removed purchasable profile pictures, animated avatars, and chat pictures from normal TSN.
- Removed chat-picture sending from private chat.
- New users no longer receive any shop/currency fields.
- Normal TSN no longer needs TSN-S wallet environment variables.


## Global chat scroll fix

- Opening/loading TSN now starts the global chat at the newest messages at the bottom.
- If you scroll up to read older global chat messages, new incoming messages no longer force you down to the bottom.
- Your own sent global chat messages still scroll to the bottom immediately after sending.

## Admin privacy change

Admins can no longer read private message content in the admin message archive.

Admins can still see private-message counts:

- total private messages in admin stats
- per-user private message counts in the user moderation table
- `/api/admin/messages` returns `privateMessagesCount`

Private-message reports keep metadata for moderation, but the message body is redacted.

## Deploy on Render

Use:

```txt
Build Command: npm cache clean --force && npm install --omit=dev --no-audit --no-fund --prefer-online
Start Command: npm start
NODE_VERSION=20.12.2
```

Required env vars:

```txt
NODE_ENV=production
MONGODB_URI=your MongoDB Atlas connection string
MONGODB_DB_NAME=tsn
JWT_SECRET=long random secret
TSN_DATA_ENCRYPTION_KEY=long random secret
TSN_ADMIN_SETUP_PASSWORD=your admin setup password
```

Recommended deployment step after replacing the old version:

```txt
Manual Deploy → Clear build cache & deploy
```
