# Deployment

Target setup (all managed, India region where possible):

| Piece | Service | Region |
| --- | --- | --- |
| App (Next.js) | Vercel (project already connected to the GitHub repo) | `bom1` Mumbai (set in `vercel.json`) |
| Database | Neon Postgres (or Supabase) | AWS `ap-south-1` Mumbai |
| Sign-in | Built in (PIN / phone + event code) — no provider | — |
| Live updates | Built in (polling) — no provider | — |
| Maps | "Open in Google Maps" links (free); embedded map optional (Google billing account) | — |

Never paste secrets into chat, issues, commits or screenshots. Enter them only in the provider dashboards and in Vercel → **Settings → Environment Variables**.

## 1. Database (Neon)

1. Create a Neon project in **AWS Asia Pacific (Mumbai)**, Postgres 17.
2. Copy two connection strings from **Connect**:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` (used by the app).
   - **Direct** (no `-pooler`) → `DIRECT_DATABASE_URL` (used only by migrations).
   Both end with `?sslmode=require`.
3. Create a **branch** named `preview` for preview deployments (so pull requests never touch production data) and copy its pooled string too.
4. Backups: Neon keeps point-in-time history (length depends on plan). Before any migration that changes or removes columns, create a branch as a manual restore point.

## 2. Vercel environment variables

Vercel → Project → Settings → Environment Variables. Set per environment:

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Neon main, pooled | Neon `preview` branch, pooled | |
| `DIRECT_DATABASE_URL` | Neon main, direct | (optional) | Migrations only |
| `APP_URL` | `https://<your-domain>` | `https://<project>.vercel.app` | Same-origin checks also accept the request's own host |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | optional | optional | Only for the embedded map (needs Google billing). Leave unset for zero provider cost. |
| `CRON_SECRET` | ✓ | — | `openssl rand -hex 32`; Vercel Cron sends it to `/api/cron/prune` |
| `MIGRATE_ON_BUILD` | — | `1` only if Preview uses its own DB | Production always migrates |

`NEXT_PUBLIC_*` values are built into the page: redeploy after changing them.

## 3. Build and migrations

`vercel.json` sets the build command to `npm run vercel-build` (`scripts/vercel-build.mjs`):

- **Production** (`VERCEL_ENV=production`): `prisma migrate deploy` (applies committed migrations only; never resets or drops), then `next build`. If the migration fails, the deployment fails and the previous version stays live.
- **Preview**: no migrations unless `MIGRATE_ON_BUILD=1`.

Merging to `main` deploys production. Pull requests get preview URLs.

## 4. First production deploy

1. Set all Production variables (section 2).
2. Merge to `main` (or Vercel → Deployments → Redeploy). Check the build log shows `applying migrations (production)`.
3. Create the first Owner from your computer (prints a one-time setup code; then sign in → "Staff or coordinator" → "First time" and choose a PIN) against the production database, without saving the URL in shell history:
   ```bash
   npx vercel env pull .env.production.local --environment=production
   ```
   ```bash
   npx tsx --env-file=.env.production.local scripts/create-owner.ts --phone "<your mobile>" --name "<your name>"
   ```
   Then delete `.env.production.local` (it's git-ignored, but don't keep production secrets on disk).
4. Do **not** run `npm run db:seed` against production (it refuses non-local databases anyway).

## 5. Smoke test (after every production deploy)

1. `https://<domain>/api/health` → `{"ok":true,"database":"up"}`.
2. Sign in as the Owner (setup code → PIN). Create an event (Events), then open Hotels, Buses, People; switch to Hindi.
3. Create a test hotel, bus, coordinator (note the setup code) and attendee (your own second phone); sign in as each in a private window.
4. Coordinator test on a **real phone** (Android Chrome and iPhone Safari): sign in, start trip, change status, start sharing location, walk/drive a few hundred metres with the screen on; watch the attendee page update. Lock the phone for 2 minutes and confirm the attendee page shows "may be out of date". End the trip.
5. Owner → Audit log shows the changes. Deactivate the test records.

## 6. Rollback

- App: Vercel → Deployments → previous deployment → **Instant Rollback**.
- Database: migrations are forward-only. Fix problems with a new migration; for data loss, restore from a Neon branch/point in time. Never `migrate reset` production.

## 7. Custom domain

Vercel → Settings → Domains. Then update `APP_URL`, the Google Maps key's website restrictions, and redeploy. Geolocation only works on HTTPS (Vercel provides it).

## Cost review (Phase 8)

No SMS, OTP, realtime or map **provider** fees: sign-in, live updates and maps-as-links are built into the app. What can still cost money:

| Item | Free option | Limits / risks to check before relying on it |
| --- | --- | --- |
| Hosting (Vercel) | Hobby plan | Terms restrict Hobby to personal, **non-commercial** use; a business running events may need Pro (paid). Monthly limits on function invocations, CPU time and bandwidth; exceeding them pauses or bills. |
| Database (Neon) | Free tier | Limited compute hours/month, storage and connections; compute scales with request volume. |
| Scheduled cleanup (Vercel Cron) | Included | Hobby allows a small number of daily cron jobs. |
| Custom domain | — | Registrar fee if you want your own domain (optional). |
| Google Maps embed | — | Needs a billing account; free monthly credit then pay-as-you-go. Off by default. |

**Load estimate (worst case, event day):** 2,000 attendees with the page open poll every 20 s → ~100 requests/s (~6,000/min, ~360,000/hour), each a small database read; plus ~20 buses × 1 GPS write/6 s. Pages only poll while visible and slow to 60 s when no trip is running, so real traffic is usually far lower — but at the upper end this likely **exceeds free-tier limits** on Vercel and Neon. Options if needed: longer poll interval for attendees (e.g. 30–60 s), a paid plan for event days, or a self-hosted server/database. Measure with the k6 script (OPERATIONS.md) on staging before the event. Free-tier limits and terms change; check the providers' current pricing pages.
