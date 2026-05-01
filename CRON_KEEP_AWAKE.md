# TSN V1.1 keep-awake ping

TSN includes this endpoint:

```text
/api/ping
```

Use an external cron/monitor service to request it about every 10 minutes:

```text
https://your-tsn-site.onrender.com/api/ping
```

MongoDB keeps the data safe. The ping only helps reduce Render Free sleeping.

You can also run the helper manually:

```bash
TSN_PING_URL=https://your-tsn-site.onrender.com/api/ping npm run ping-self
```

With MongoDB enabled, a Render restart/redeploy should not delete accounts, global messages, private messages, bans, or admin settings.
