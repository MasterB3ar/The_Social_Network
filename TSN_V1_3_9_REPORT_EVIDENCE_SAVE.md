# TSN V1.3.9 — Report Evidence Save

This update makes reports save a snapshot of the reported target at the moment the report is created.

## What changed

- Global chat message reports now save the reported message text as report evidence.
- Global comment reports now save the reported comment text and the parent global message text.
- User reports now save the reported user's name/username snapshot.
- If a user is reported from a private chat, TSN also saves the latest private-chat message as hidden internal evidence.
- Private message reports save private-message evidence internally, but the message body stays hidden from admins.
- Admin report view now shows when report evidence was saved and when the original target has been deleted.
- If a reported global chat message is deleted later, the report still keeps the original saved text.

## Privacy rule kept

Admins still cannot read private message bodies. Private message report evidence is retained internally but is not returned in admin API responses or rendered in the admin dashboard.

## Environment variables

No new environment variables were added.
