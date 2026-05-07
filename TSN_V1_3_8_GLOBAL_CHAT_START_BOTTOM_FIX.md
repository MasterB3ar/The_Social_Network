# TSN v1.3.8 — Global chat start-at-bottom fix

Fixed the regression where Global chat could start at the top after v1.3.7.

## Changed

- Global chat now force-scrolls to the bottom after initial message load.
- The bottom-scroll is repeated briefly to survive late browser layout changes.
- Incoming messages still do not force-scroll the user down while they are reading old messages.
- The “new messages” button still appears when the user is scrolled up.
- Sending your own message still scrolls to the bottom.

## Files changed

- `public/app.js`
- `package.json`
- `package-lock.json`
- `README.md`
