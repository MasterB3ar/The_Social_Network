# TSN V1.3.5 — Global chat update

This update turns the old global-post experience into a chat-first global feed.

## Changed

- Replaced the visible Global Posts area with Global Chat.
- New global messages render like chat bubbles.
- New global messages appear in chronological chat order and the feed stays near the bottom while chatting.
- Removed the visible likes/comments/detail-post workflow from the global area.
- Admin dashboards now label the global area as Global Chat.
- Admins can still moderate/delete global chat messages.
- Private message content is still hidden from admins; admins can only see private-message counts.
- TSNM Market/currency/shop remains removed from normal TSN.

## Compatibility

The database still uses the existing `globalMessages` collection/state field so existing global messages are not lost during deployment. Old historical comments may remain in the database/admin archive, but the normal UI no longer uses comments for new global chat.
