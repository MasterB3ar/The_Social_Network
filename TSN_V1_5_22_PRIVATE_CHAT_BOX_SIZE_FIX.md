## TSN V1.5.22 — Private Chat Box Size Fix

Fixes a regression from V1.5.21 where the private chat panel could appear as a large unclosable “Chat” box.

- Hidden private chat panels are now really hidden again.
- The close button works because `.chat-panel.hidden` is no longer overridden by the private chat UI CSS.
- The private chat box is smaller and less intrusive on desktop.
- Mobile chat is still large enough to use, but no longer forces a broken full-screen box.
- Private chat pictures/GIFs keep the improved layout, but are capped to a more reasonable height.
