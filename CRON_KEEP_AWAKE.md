# Cron / keep-awake til Render

Render Free kan gå i sleep. Du kan bruge en ekstern cron-service til at pinge TSN.

Ping denne URL hvert 10. minut:

```text
https://dit-tsn-site.onrender.com/api/ping
```

TSN svarer med JSON, hvis serveren er vågen.

## Vigtigt

Cron holder kun serveren vågen. Det er **MongoDB Atlas**, der sikrer, at brugere og beskeder ikke forsvinder ved deploys/restarts.
