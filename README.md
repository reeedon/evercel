
# EV Charging Queue — Vercel + Neon (serverless Postgres)

This package includes:
- **Frontend**: `index.html` (Enhanced UI)
- **API**: `/api/users`, `/api/state`, `/api/settings`, `/api/reset-timer` (Vercel serverless functions)
- **Cron**: `vercel.json` runs `/api/reset-timer` daily at **06:00 UTC**

## Deploy (GitHub or CLI)

### GitHub (recommended)
1. Create a new GitHub repo and push these files.
2. In Vercel → **Add New Project** → import the repo.
3. In **Project Settings → Environment Variables**, add:
   - `DATABASE_URL` = your Neon connection string (e.g., `postgresql://user:pass@ep-...neon.tech/neondb?sslmode=require`).
4. Deploy.

### Vercel CLI
```bash
npm install -g vercel
vercel
```
Follow prompts, then add `DATABASE_URL` in Vercel Project Settings.

## Notes
- **ETag & concurrency**: `/api/state` uses `state_meta.version` as ETag; client sends `If-Match` to prevent overwrites.
- **Schema**: tables created on first run (`users`, `spots`, `queue`, `state_meta`, `settings`).
- **Time zone**: Cron runs in UTC; `reset_time` stored in DB is interpreted as UTC for consistency.

