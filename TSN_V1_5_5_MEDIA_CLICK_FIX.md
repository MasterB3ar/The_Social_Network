# TSN V1.5.5 — Media Display + Click Fix

This update fixes two issues from the picture/media and reaction popup versions:

- Clicking a private chat message could throw `WarnButton is not defined`.
- TSN media/pictures did not display cleanly in chat bubbles, the media picker, or the message popup.

## Fixes

- Removed the misplaced admin warning/badge handler from the private-message click listener.
- Kept admin warning and badge controls in the admin user list only.
- Improved picture/GIF layout in global chat and private chat.
- Improved picture/GIF layout inside the message action popup.
- Improved safe media picker thumbnails so images are no longer awkwardly cropped.
- Added better mobile sizing for chat pictures.

No new environment variables were added.
