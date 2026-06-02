# TSN V1.5.17 — Media Search Button Fix

Fixes the media search button not doing anything in the Global Chat and Private Chat media picker.

## What changed
- Replaced the nested media search `<form>` with a safe `<div>` search panel.
- Added direct click handling for the `Søg` button.
- Added Enter-key search support inside the media search input.
- Prevents the outer chat send form from stealing the media search submit event.

## Why it happened
The GIF/photo search panel was rendered inside the chat send form. Browsers do not handle nested forms reliably, so pressing `Søg` could submit the outer chat form instead of running the media search.
