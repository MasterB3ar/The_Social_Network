# TSN V1.5.18 — Media Search Real Button Fix

This update fixes the GIF/photo search button when the media picker is opened inside global chat or private chat.

## Fixed

- The search panel is no longer a nested `<form>` inside the chat send form.
- The search button is now a real `type="button"` action with `data-media-search-submit`.
- Pressing Enter in the media search input still starts media search.
- The frontend cache-busting script URL now uses `/app.js?v=1.5.18`.
- The search errors are shown inside the media picker instead of failing silently.

## No new environment variables

Keep the existing media settings:

```txt
TSN_MEDIA_WEB_SEARCH_ENABLED=true
TSN_MEDIA_WEB_PROVIDERS=giphy,pixabay
TSN_GIPHY_API_KEY=your-giphy-key
TSN_PIXABAY_API_KEY=your-pixabay-key
```
