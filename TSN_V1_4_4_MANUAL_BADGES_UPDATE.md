# TSN V1.4.4 — Manual Badges Update

This update changes profile badges so TSN no longer automatically gives Founder/Admin visible profile badges.

## Changed

- Every user now has the default `Member` badge.
- Founder badges are no longer assigned or shown automatically.
- Admin role badges are no longer shown automatically as profile badges.
- Admins can manually give special badges to users from the Admin user list.
- Admins can remove all special badges from a user, leaving only `Member`.

## Admin usage

1. Open **Admin**.
2. Find the user.
3. Click **Badges**.
4. Enter comma-separated badges, for example:
   - `Founder`
   - `VIP`
   - `Trusted`
   - `Beta Tester`
5. Leave the prompt empty to remove all custom badges.

## Environment variables

`TSN_FOUNDER_BADGE_LIMIT` was removed from normal TSN setup.

New optional setting:

```txt
TSN_MAX_CUSTOM_BADGES_PER_USER=6
```
