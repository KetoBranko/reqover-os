# Deployment (Vercel + Supabase)

Product name is ProRendo; the hosting projects below still carry the old name `reqover-os` (renaming them changes URLs and is done by the owner, if at all).

- Supabase project `reqover-os` (ref `peqewlbyniyhdwpttshh`, region eu-central-1 / Frankfurt).
- Vercel project `reqover-os`, connected to this repository; pushes to `main` deploy to production.
- `npm run vercel-build` applies pending migrations (`scripts/migrate.mjs`) before `next build`, on production deployments only. Preview deployments never touch the database schema.

## Environment variables (Vercel, Production)

| Variable | Set by | Notes |
| --- | --- | --- |
| `APP_ENV` | Claude | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | Claude | `https://peqewlbyniyhdwpttshh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Claude | publishable key, safe in the browser |
| `SUPABASE_POOLER_HOST` | Claude | Supavisor host for eu-central-1 |
| `SUPABASE_DB_PASSWORD` | Owner | Supabase → Database → Settings → Reset database password. Never in chat or git |
| `AI_PROVIDER` | Claude | `anthropic` |
| `ANTHROPIC_API_KEY` | Owner | optional; without it all workflows stay manual |

With only `SUPABASE_DB_PASSWORD` given, the app builds `DATABASE_URL` (transaction pooler, port 6543) and the migration URL (session pooler, port 5432) itself. The server still runs every user request as role `authenticated` with the user's JWT claims, so RLS applies.

## Supabase Auth settings (dashboard)

- Authentication → Sign In / Providers → "Allow new users to sign up": **off** (accounts are created by the owner).
- Users are added under Authentication → Users → "Add user" (with "Auto Confirm User").
