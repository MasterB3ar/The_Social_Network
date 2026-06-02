# TSN V1.5.15 — Pixabay + GIPHY Only Media

This update removes the built-in TSN safe media list. Users can only send GIFs/photos selected from approved website media search results.

## Changed

- Deleted default TSN safe media from the picker.
- Removed the “TSN sikre medier” section.
- Added GIPHY GIF search support.
- Kept Pixabay photo search support.
- New messages only accept IDs from the web media cache, such as `giphy:...` or `pixabay:...`.
- Random uploads, custom URLs, base64 images, and removed safe-media IDs are blocked.

## Render environment variables

```env
TSN_MEDIA_WEB_SEARCH_ENABLED=true
TSN_MEDIA_WEB_PROVIDERS=giphy,pixabay
TSN_GIPHY_API_KEY=your-giphy-key
TSN_GIPHY_RATING=pg-13
TSN_GIPHY_LANG=da
TSN_PIXABAY_API_KEY=your-pixabay-key
```
