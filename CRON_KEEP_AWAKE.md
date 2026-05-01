# TSN V1.0 keep-awake ping

TSN includes this endpoint:

```text
/api/ping
```

Use this full URL:

```text
https://your-tsn-site.onrender.com/api/ping
```

Set an external monitor/cron service to request it every 10 minutes.

## Free external monitor option

Use a free uptime monitor such as cron-job.org or UptimeRobot:

```text
URL: https://your-tsn-site.onrender.com/api/ping
Method: GET
Interval: 10 minutes
```

## Render Cron Job option

This project includes:

```text
render.cron.yaml
scripts/ping-self.js
```

But Render Cron Jobs are not free. Only use this if you accept the extra Render Cron Job cost.

## Important warning

A keep-awake ping is a workaround. It can reduce Render Free cold starts, but it should not be your only reliability plan.

The real fix for data loss is MongoDB:

```env
MONGODB_URI=...
```

With MongoDB enabled, a Render restart/redeploy should not delete accounts, messages, rooms, passwords, bans, or posts.
