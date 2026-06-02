# TSN V1.5.3 — Website Media Search

This update adds website-based media search without allowing random uploads.

## Added

- `/api/media-search` backend endpoint.
- Tenor GIF search support.
- Pixabay photo search support.
- Search UI inside the Global Chat and Private Chat media picker.
- Server-side cache so users can only send media that came from TSN's own search endpoint.

## Safety behavior

- Random user uploads are still blocked.
- Custom `dataUrl`, `base64`, and arbitrary media URLs are rejected.
- Users can only send media from:
  - the built-in TSN safe media library, or
  - recent `/api/media-search` results.

## Env vars

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
