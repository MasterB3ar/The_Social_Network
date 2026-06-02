# TSN V1.5.2 — Safe Picture/GIF Library

This update replaces random image uploads with a safe built-in TSN media library.

Users can no longer upload arbitrary images from their device. They can only select pre-approved pictures/GIF-style items from the TSN library.

Why:
- Prevents users from sending bad/inappropriate custom images.
- Keeps image/GIF sending fun but controlled.
- Works without external file storage.

Notes:
- This does not use WhatsApp's copyrighted sticker/GIF database.
- It provides a safe WhatsApp-style picker inside TSN.
- The backend validates every media message by `libraryId`.
