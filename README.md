# TSN V1.4.0 — Growth Update

TSN is now a chat-first social network with founder badges, better profiles, friend requests, notifications, @mentions, emoji reactions, admin warnings, and mobile polish.

Privacy stays the same: admins cannot browse every private conversation. They can only see private-message content when a user reports it as moderation evidence.

## V1.3.10 reported private evidence visible

Reports now keep a saved snapshot of the reported target at the moment the report is created. If a reported global chat message is deleted later, the admin report still keeps the saved evidence. Private message reports keep evidence internally, and reported private-message evidence is visible to admins inside the reports panel.

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
- Admins still cannot browse all private-message content, but they can read private messages that users explicitly report as moderation evidence.

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

## V1.3.10 reported private evidence visible

- Reported private-message evidence is now visible to admins inside the reports panel.
- Admins still cannot browse every private conversation from the admin message archive.
- Existing saved report evidence is reused, so messages remain visible in the report even if the original message is deleted later.

## TSN V1.4.0 — Growth Update

This version adds the next community-growth features:

- Founder badges for early accounts.
- Better profiles with status text, banner text, badges, and joined-days display.
- Friend requests, friend lists, accept/decline/remove actions.
- Notification inbox for mentions, private messages, friend requests, reactions, and admin warnings.
- @username mentions in global and private chat.
- Emoji reactions on global chat messages and private messages.
- Admin warning system with warning notifications and admin dashboard counts.
- Rules panel updated with warning/mute/moderation language.
- Mobile polish for navigation, chat, friends, notifications, and reactions.

Optional V1.4.0 env vars:

```txt
TSN_FOUNDER_BADGE_LIMIT=40
TSN_NOTIFICATION_LIMIT=3000
TSN_WARNINGS_LIMIT=1000
```

Privacy note: admins still cannot browse every private conversation from the message archive. Reported private-message evidence remains visible in the reports panel for moderation.


## TSN V1.4.1 — Notification + Reaction Popup Polish

This update cleans up the chat UI without changing the backend database format.

- Notifications now use a cleaner inbox-style card layout.
- Global chat messages and private messages are now clickable/tappable.
- Emoji reactions moved into a popup menu instead of showing an ugly reaction row under every message.
- The popup also contains report/delete actions where the user has permission.
- Existing reaction counts are still visible as small compact chips on messages.
- Mobile layout was improved so the popup behaves like a bottom sheet on phones.

No new environment variables are required.


## TSN V1.4.2 — Notification + Reaction Visual Rewrite

This version rebuilds the notification inbox and message reaction popup UI. Notifications now use a cleaner inbox layout with an unread summary, better spacing, unread indicators, and improved mobile layout. Message reactions are no longer shown as ugly always-visible controls; users click or tap a global/private message to open a cleaner reaction/action popup. Reaction chips only appear on the message when there are actual reactions.


## TSN V1.4.3 — Sidebar Notification Button Fix

This update fixes the sidebar navigation item for `🔔 Notifikationer`.

Changed:

- The notification sidebar button now uses the same label layout as the other sidebar buttons.
- The unread badge no longer breaks the text sizing or alignment.
- The desktop sidebar and mobile horizontal nav both keep the notification item aligned correctly.

No new environment variables were added.
