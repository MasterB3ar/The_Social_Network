
## TSN v1.3.8 — Global chat start-at-bottom fix

This release fixes a regression where Global chat could open at the top after the chat-upgrades release. The chat now requests a bottom scroll after message loading and repeats it briefly while the browser finishes layout, without forcing users down when new messages arrive while they are reading older chat.

# TSN V1.3.7 — Chat upgrades

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

## TSN V1.3.7 — Chat upgrades

This version adds chat-focused upgrades:

- Global chat opens at the bottom.
- If you scroll up, new messages no longer force you to the bottom.
- A "new messages" button appears when new global messages arrive while you are reading older chat.
- Server-side anti-spam protects global chat and private chat.
- Repeated duplicate messages and fast message bursts are blocked.
- Repeated spam warnings can automatically mute a user for a short time.
- Admins can mute/unmute users from the admin dashboard.
- Admins still cannot read private-message content; they can only see private-message counts.

Optional anti-spam env vars:

```txt
TSN_ANTI_SPAM_ENABLED=true
TSN_MESSAGE_COOLDOWN_MS=1500
TSN_DUPLICATE_MESSAGE_WINDOW_MS=120000
TSN_MAX_DUPLICATES_PER_WINDOW=3
TSN_SPAM_WINDOW_MS=60000
TSN_MAX_MESSAGES_PER_SPAM_WINDOW=20
TSN_AUTO_MUTE_AFTER_WARNINGS=5
TSN_AUTO_MUTE_MINUTES=10
TSN_DEFAULT_ADMIN_MUTE_MINUTES=10
```
