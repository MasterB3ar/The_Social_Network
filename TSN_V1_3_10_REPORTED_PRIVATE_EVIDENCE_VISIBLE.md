# TSN V1.3.10 — Reported private evidence visible

This update changes reports so admins can read private messages only when the message was explicitly reported.

## Changed

- Removed the placeholder text: `[Privat besked gemt som rapport-evidence, men skjult for admins]`.
- Reported private-message evidence now displays the saved message text in the admin reports panel.
- User reports from private chat can also include the latest private-message context as visible report evidence.
- Admins still cannot browse all private chats from the admin message archive; only reported evidence is visible.
- Existing report snapshots still work, so deleted messages remain visible in the report evidence.

## No env changes

No new environment variables are required.
