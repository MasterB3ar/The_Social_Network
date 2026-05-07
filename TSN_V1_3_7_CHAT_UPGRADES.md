# TSN V1.3.7 — Chat Upgrades

This update keeps TSN chat-focused and keeps TSNM/Shop removed.

## Added

- Global chat "new messages" button.
- Global chat still opens at the bottom.
- New messages no longer force-scroll users down while they read older messages.
- Stronger server-side anti-spam for global chat, historical comments, and private chat.
- Duplicate-message protection.
- Fast-message cooldown.
- Automatic temporary mute after repeated spam warnings.
- Admin mute/unmute buttons.
- Admin stats now include muted users and active spam warnings.

## Privacy kept

- Admins still cannot read private messages.
- Admins can still see private-message counts.
- Private-message reports hide the private text body.

## Optional environment variables

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
