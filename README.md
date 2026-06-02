# TSN V1.4.4 — Manual Badges Update

TSN is now a chat-first social network with manual admin badges, a default Member badge, better profiles, friend requests, notifications, @mentions, emoji reactions, admin warnings, and mobile polish.

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

## TSN V1.5.1 — Growth Update

This version adds the next community-growth features:

- Everyone has the default Member badge; admins can manually give/remove special badges.
- Better profiles with status text, banner text, admin-controlled badges, and joined-days display.
- Friend requests, friend lists, accept/decline/remove actions.
- Notification inbox for mentions, private messages, friend requests, reactions, and admin warnings.
- @username mentions in global and private chat.
- Emoji reactions on global chat messages and private messages.
- Admin warning system with warning notifications and admin dashboard counts.
- Rules panel updated with warning/mute/moderation language.
- Mobile polish for navigation, chat, friends, notifications, and reactions.

Optional V1.4.x env vars:

```txt
TSN_MAX_CUSTOM_BADGES_PER_USER=6
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

### V1.4.4 badge behavior

- No automatic Founder/Admin profile badges are shown anymore.
- Every user gets the default `Member` badge.
- Admins can give users special custom badges from the Admin user list using the **Badges** button.
- Leaving the badge prompt empty removes all special badges and leaves only `Member`.


## TSN V1.5.1 - Activity + Events Update

Adds an activity homepage, TSN-S mini widget, XP/levels, daily login streaks, activity leaderboard, events, polls, activity feed, and admin event/poll creation tools.

TSNM is still removed from normal TSN. Admins still cannot browse all private messages; reported private-message evidence remains visible only inside reports.


## TSN V1.5.1 — Picture Messages

Users can now send pictures in both Global Chat and Private Chat.

- Supported image types: PNG, JPG/JPEG, GIF and WebP.
- Default max image size: 2 MB.
- Server validates image type and size before saving.
- Image messages can include optional text/caption.
- Admin privacy rules stay the same: admins cannot browse all private chats, but reported private-message evidence remains visible in reports.

Optional environment variable:

```txt
TSN_IMAGE_MAX_BYTES=2097152
```


## TSN V1.5.2 — Safe Picture/GIF Library

Random image uploads are blocked. Users can only send pre-approved safe pictures/GIF-style media from the built-in TSN library, similar to choosing a safe sticker/GIF instead of uploading anything from their device.

- Global Chat supports safe library pictures/GIFs.
- Private Chat supports safe library pictures/GIFs.
- The server rejects custom `dataUrl` uploads and only accepts known `libraryId` values.
- Existing old image messages can still display, but new messages must use the safe library.
- `/api/media-library` returns the allowed items.

## TSN V1.5.3 — Website Media Search

TSN can now search approved external websites for GIFs/photos while still blocking random user uploads.

- Users can search Tenor for GIFs when `TSN_TENOR_API_KEY` is set.
- Users can search Pixabay for photos when `TSN_PIXABAY_API_KEY` is set.
- Custom uploads, custom URLs, base64, and arbitrary data URLs are still rejected by the server.
- Messages only accept media IDs returned by `/api/media-library` or `/api/media-search`.
- Web search results are cached for a short time; if a user waits too long, they must search again before sending.

Optional environment variables:

```txt
TSN_MEDIA_WEB_SEARCH_ENABLED=true
TSN_MEDIA_WEB_PROVIDERS=tenor,pixabay
TSN_MEDIA_WEB_SEARCH_LIMIT=18
TSN_MEDIA_WEB_CACHE_TTL_MS=900000
TSN_TENOR_API_KEY=
TSN_TENOR_CLIENT_KEY=tsn
TSN_TENOR_CONTENT_FILTER=high
TSN_TENOR_LOCALE=da_DK
TSN_PIXABAY_API_KEY=
```

If no API keys are set, the built-in safe TSN media library still works.


## TSN V1.5.4 — Voice/Video Calls

Private chats now include voice and video call buttons. Users can call each other when both users are online. Calls use WebRTC in the browser and Socket.IO only for signalling.

Important: calls require HTTPS and microphone/camera permission. No new environment variables are needed.
