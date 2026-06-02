# TSN V1.5.1 — Picture Messages

Added picture sending to normal TSN.

## Added

- Send pictures in Global Chat.
- Send pictures in Private Chat.
- Optional text/caption with image messages.
- Image previews before sending.
- Server-side validation for PNG, JPG/JPEG, GIF and WebP.
- Default max image size: 2 MB.

## Environment variables

```txt
TSN_IMAGE_MAX_BYTES=2097152
```

No separate storage service is required. Pictures are stored as validated message attachments in the TSN database.
