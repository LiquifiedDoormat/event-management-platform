# Event Management Platform

Mobile-first, English/Hindi web app for running event logistics: hotels, hotel coordinators, buses and attendees, with live bus tracking shared from the coordinator's phone.

> **Status:** Phases 1–7 are implemented (deployment tooling ready; production not yet configured): app shell, bilingual routing, database schema, CI, phone OTP sign-in, sessions, role-based access control, Owner/Admin management, the attendee experience with maps, and live transport: coordinators start/end trips, set the bus status with large buttons and share GPS from their phone; attendees see status and position update live; Owner audit log and event settings; profile with preferred language; accessibility and mobile polish. Real-phone GPS, Pusher, Google Maps and Twilio still need **live verification with real accounts/devices** (see below). See [PROJECT_MEMORY.md](PROJECT_MEMORY.md) for exact progress.

## Planned features

- Phone OTP sign-in with persistent sessions
- Roles: Owner, Admin, Coordinator, Customer (attendee), with server-side access control
- Hotel, coordinator, bus and people directories with detail pages
- Coordinator-controlled bus status and live GPS on Google Maps
- English and Hindi throughout

## Tech stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · next-intl · Zod · Prisma 7 · PostgreSQL 17 · Vitest. Planned: Twilio Verify, Pusher Channels, Google Maps Platform, Vercel.

## Prerequisites

- Node.js 22 or newer, npm
- Docker Desktop (for the local database)

## Getting started

```bash
git clone https://github.com/LiquifiedDoormat/event-management-platform.git
cd event-management-platform
npm install
cp .env.example .env
```

Edit `.env`: choose any local value for `POSTGRES_PASSWORD` and put the same value into `DATABASE_URL` and `TEST_DATABASE_URL`. Then:

```bash
npm run db:up        # start local Postgres in Docker
npm run db:migrate   # apply database migrations
npm run db:seed      # optional: fake demo data (local only)
npm run dev          # open http://localhost:3000
```

## Signing in locally

With `OTP_PROVIDER=dev`, no SMS is sent: the code appears in the terminal running `npm run dev` as `[dev-otp] code for +••••••••0100: 123456`.

Seeded demo accounts (fake numbers): admin `99999 00002`, coordinators `99999 00010`/`00011`, attendees `99999 00100`–`00104` and `00110`–`00114`.

## Creating the first Owner

Owners cannot be created in the app. Run this once, with `DATABASE_URL` pointing at the target database:

```bash
npm run owner:create -- --phone "98765 43210" --name "Full Name"
```

It refuses if an Owner already exists (`--allow-additional` overrides) or if the number belongs to another account (`--promote-existing` promotes it and signs that account out everywhere). The action is recorded in the audit log.

## Google Maps

Maps appear on the attendee homepage (hotel) and on bus tracking pages (hotel, numbered stops, bus position). Without a key, the app shows addresses and "Open in Google Maps" links instead, so maps are optional for local work.

1. Google Cloud Console → create a project → **Billing** → link a billing account.
2. **APIs & Services → Library** → enable **Maps JavaScript API** (the only API the app uses).
3. **APIs & Services → Credentials → Create credentials → API key**. Then **edit the key**:
   - *Application restrictions*: **Websites**, add `http://localhost:3000/*` and your production domain (e.g. `https://your-app.vercel.app/*`).
   - *API restrictions*: **Restrict key** → Maps JavaScript API only.
4. Optional: **Google Maps Platform → Map management → Create Map ID** (JavaScript, vector). Without one the app uses Google's `DEMO_MAP_ID`, which is fine for development.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`) in `.env` / Vercel, then restart `npm run dev` (these values are built into the page).

**Cost and quotas:** dynamic map loads are billed per 1,000 loads after Google's monthly free usage; check https://mapsplatform.google.com/pricing/. A map loads only when someone opens a page with a map, and only once per page view. Set a **budget alert** (Billing → Budgets) and per-day **quota caps** (APIs & Services → Maps JavaScript API → Quotas) before the event. The key is visible in the browser by design; the website and API restrictions above are what stop others using it.

**Status:** implemented with a tested fallback, but **not yet verified with a real API key**.

## Live updates (Pusher Channels)

Status changes and bus positions are pushed to attendees through Pusher private channels (`private-bus-{busId}`); each subscription is authorized by `/api/realtime/auth` using the same rules as the tracking page. **Without Pusher the app still works:** pages check for updates every 15 seconds instead.

1. Create an account at https://pusher.com → **Channels** → create an app (cluster close to your users, e.g. `ap2` Mumbai).
2. App Keys: copy `app_id`, `key`, `secret`, `cluster`.
3. Set `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`, then restart the server.

**Cost:** Pusher plans are priced by concurrent connections and messages per day (https://pusher.com/channels/pricing). Each open attendee page holds one connection; each location update (≈ every 5–10 s per moving bus) is one message per subscriber. For 2,000 concurrent viewers you need a paid plan sized for ≥2,000 connections; estimate messages as `buses × updates/minute × viewers per bus × minutes`. The app sends one small message per change (no full history).

**Status:** implemented and tested with the polling fallback; **not yet verified against a real Pusher app.**

## Coordinator: running a trip

1. Sign in with the coordinator's number → **Start trip** on their bus (staff can also start one for the bus's designated coordinator from the bus page).
2. Tap the large status buttons (Boarding, On the way to hotel, …). If two phones disagree, the older one is told the status changed and shown the latest.
3. Tap **Start sharing location** and allow location access. Keep the page open with the screen on: phones pause websites when locked or in the background. The app asks the phone to keep the screen on (Wake Lock) where supported.
4. Tap **End trip** when done; the live position is removed and attendees see "not running".

**GPS limits:** a normal website cannot share location reliably in the background. If continuous background tracking becomes a requirement, it needs a native app (or a dedicated GPS device).

## Data retention

Run `npm run ops:prune` daily (e.g. a scheduled job) to delete GPS history older than `EventConfig.locationRetentionDays` (default 7), old sessions and expired rate-limit counters. The latest bus position is kept only while a trip is active.

## Phone OTP provider (Twilio Verify)

1. Create a Twilio account at https://www.twilio.com and upgrade it (trial accounts can only text verified numbers).
2. Console → **Verify → Services → Create**. Enable the **SMS** channel. Copy the Service SID (`VA…`).
3. Console → **Account Info**: copy the Account SID (`AC…`) and Auth Token.
4. In `.env` (or Vercel environment variables): `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
5. In Verify → Settings, consider enabling **Fraud Guard** and restricting SMS to India (+91) to block SMS-pumping abuse.

**Cost:** Twilio Verify charges per successful verification plus an SMS fee per message to India; see https://www.twilio.com/en-us/verify/pricing. Each user verifies once per device (sessions last 30 days of inactivity), so expect roughly one verification per attendee per device. Twilio handles Indian DLT registration for Verify. A cheaper India-only provider (e.g. MSG91) can be added as another `OtpProvider` in `src/lib/auth/otp/` without changing the rest of the app.

**Status:** the Twilio integration is implemented but has **not yet been tested against a real Twilio account**.

## Environment variables

All configuration lives in `.env` (git-ignored). `.env.example` lists every variable with placeholders only. Variables starting with `NEXT_PUBLIC_` are visible in the browser, so never put secrets in them. The app validates its configuration on first use and reports which variable names are missing or invalid.

| Variable | Needed from | Where to get it |
| --- | --- | --- |
| `APP_URL` | now | Your site's URL |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` | now | Local: you choose. Production: your managed Postgres provider |
| `OTP_PROVIDER`, `TWILIO_*` | now (`dev` locally) | Twilio Console → Verify → Services |
| `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*` | optional (polling without) | Pusher dashboard → Channels app → App Keys |
| `NEXT_PUBLIC_GOOGLE_MAPS_*` | Phase 4 | Google Cloud Console → APIs & Services → Credentials |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint + type-check + all tests |
| `npm run test:unit` / `npm run test:integration` | Unit tests / integration tests (need `TEST_DATABASE_URL`) |
| `npm run owner:create -- --phone … --name …` | Create the first Owner |
| `npm run ops:prune` | Data-retention cleanup (run daily; production uses Vercel Cron) |
| `npm run vercel-build` | Vercel build: migrations (production only) + `next build` |
| `npx tsx scripts/loadtest-seed.ts` | Load-test data + session tokens (local/staging DBs only) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run db:migrate` | Create/apply migrations (development) |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run db:studio` | Browse the database |

## GitHub workflow

- Work on a feature branch, open a pull request into `main`. CI (`.github/workflows/ci.yml`) runs migrations, lint, type-check, tests and a production build.
- Never commit `.env` or credentials. Never force-push.

## Common problems

- **`Invalid environment configuration: …`**: a variable in `.env` is missing or malformed; the message names it.
- **Database connection refused**: start Docker Desktop, then `npm run db:up`.
- **`POSTGRES_PASSWORD` required**: set it in `.env` before `npm run db:up`.
- **Pages keep reloading in development**: stop `npm run dev`, delete `.next`, start again. Avoid running `npm run build` or `npm run typecheck` (which runs `next typegen`) while the dev server is running.
- **Integration tests skipped**: set `TEST_DATABASE_URL` (its database name must contain `test` or `ci`).
- **Password mismatch after changing `.env`**: the Docker volume keeps the first password. Change it back, or `docker compose down -v` to recreate the local DB (this deletes local data).

## Security

See [docs/SECURITY.md](docs/SECURITY.md). Access control is enforced on the server; the `dev` OTP provider is refused in production.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Vercel + Neon, env vars, safe migrations, first Owner, smoke test, rollback) and [docs/OPERATIONS.md](docs/OPERATIONS.md) (monitoring, daily cleanup, event-day checklist, troubleshooting, load testing).

## More documentation

- [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md): full project requirements
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, decisions, GPS data flow
- [docs/DATABASE.md](docs/DATABASE.md): data model, constraints, migration policy
- [docs/SECURITY.md](docs/SECURITY.md): auth, secrets, headers, privacy
- [PROJECT_MEMORY.md](PROJECT_MEMORY.md): development state and handover

## Current limitations

GPS sharing works only while the coordinator's page is open and on screen. Without Pusher, attendee pages update every 15 s. Maps need a Google key. Bus stops are shown as numbered markers; the app doesn't draw road routes. Accessibility has been checked by hand (keyboard, labels, tap targets, contrast), not with assistive-technology users. Directory search uses simple `contains` matching (fine for ~16k people; add trigram indexes if it gets slow). Live tracking (when built) works only while the coordinator keeps the page open; phones pause websites in the background.
