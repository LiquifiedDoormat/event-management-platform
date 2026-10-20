# Event Management Platform

Mobile-first, English/Hindi web app for running event logistics across **multiple events**: hotels, hotel coordinators, buses and attendees, with live bus tracking shared from the coordinator's phone. Designed to run **without paid SMS, OTP, realtime or map providers**.

> **Status:** Phases 1–8 implemented; production not yet deployed. Phase 8 replaced SMS OTP with PIN sign-in, added first-class events, removed Pusher and Twilio. Real-phone GPS is **not yet verified on a device**. See [PROJECT_MEMORY.md](PROJECT_MEMORY.md) for exact, verified progress.

## Features

- **Events:** independent events, each with its own hotels, buses, coordinators and attendees; chosen on the sign-in page; Owner/Admin can switch events without signing out.
- **Sign-in without SMS:** Owner/Admin/Coordinator use phone + 6-digit PIN (first PIN chosen at first sign-in; forgotten PINs reset by an administrator); attendees use phone number + event. Persistent sessions; sign-out.
- **Roles:** Owner, Admin, Coordinator, Attendee (read-only), enforced on the server.
- Hotel, bus (with stops), coordinator and people directories; assignments; audit log.
- Coordinators: trip controls, large status buttons, GPS sharing from the phone, searchable list of attendees at their hotel.
- Attendees: their hotel, coordinator, buses, stops, live status and position (updated by polling).
- English and Hindi throughout.

## Tech stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · next-intl · Zod · Prisma 7 · PostgreSQL 17 · Vitest. Hosting target: Vercel + managed Postgres (Neon). Optional: Google Maps JavaScript API. Bulk import reads `.xlsx` files with `exceljs` (added for this feature; `.csv` is parsed by a small built-in parser — the popular `xlsx`/SheetJS package was deliberately avoided, as its published versions have unfixed high-severity ReDoS/prototype-pollution advisories that are directly reachable when parsing untrusted uploaded files).

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
npm run db:seed      # fake demo data: two events (local only)
npm run dev          # open http://localhost:3000
```

## Signing in locally (demo data)

Choose an event on the sign-in page (**Demo Event — Bengaluru** or **Demo Event — Delhi**), then:

| Who | Tab | Number | PIN |
| --- | --- | --- | --- |
| Demo Admin | Staff or coordinator | `99999 00002` | `246810` |
| Coordinator 1 (both events) | Staff or coordinator | `99999 00010` | `246810` |
| Coordinator 2 (Bengaluru) | Staff or coordinator | `99999 00011` | `246810` |
| Coordinator 3 (Delhi) | Staff or coordinator | `99999 00012` | `246810` |
| Attendees, Bengaluru | An attendee | `99999 00100`–`00104`, `00110`–`00114` | — |
| Attendees, Delhi | An attendee | `99999 00200`–`00204`, `00210`–`00214` | — |

The demo PIN exists only in local seed data.

## Sign-in model (no SMS, no OTP)

- **Owner/Admin/Coordinator:** phone + 6-digit PIN. PINs are stored as salted scrypt hashes. Easy PINs (111111, 123456, …) are refused; 5 wrong PINs lock the account for 15 minutes; attempts are also rate-limited per phone and per network.
- **First sign-in:** "Staff or coordinator" → enter the phone number → **Continue**. If the account has no PIN yet, the person chooses one (twice); otherwise they enter their PIN.
- **Forgotten PIN:** an authorized administrator resets it (Owner → Admins and Coordinators; Admin → Coordinators): People → person → **Reset PIN**. The person then signs in and chooses a new one. Until they do, anyone with their number could choose it — so do it right away (see SECURITY.md).
- **Owner:** created, and recovered if the PIN is forgotten, with the CLI (needs database access):
  ```bash
  npm run owner:create -- --phone "98765 43210" --name "Full Name"
  ```
  ```bash
  npm run owner:create -- --phone "98765 43210" --reset-pin
  ```
- **Attendees:** phone number registered for the chosen event; no PIN or code. Attendees are read-only. See [docs/SECURITY.md](docs/SECURITY.md) for the residual risk.

## Live updates and maps (no paid providers)

- Attendee pages fetch the bus status/position every **20 s** while a trip is running (60 s otherwise), only while the page is visible.
- Coordinators' phones send GPS about every 5–10 s while moving (browser Geolocation API; needs HTTPS and the page kept open).
- Maps: without a key the app shows addresses and **"Open in Google Maps"** links — no embedded map, no cost, nothing to set up. With a key, the attendee tracking page (`/track/[busId]`) embeds a real interactive Google Map with a marker for the bus's latest position, which moves as new GPS readings arrive (no page reload, no map re-creation). The Google Maps link is still shown alongside it, and is the only thing shown if the map fails to load.

### Google Maps setup (optional)

Needed only for the embedded map; the app works fully without it (links only, zero cost). Two environment variables, both safe to expose to the browser (`NEXT_PUBLIC_*`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | For the embedded map | Loads the Maps JavaScript API. Missing, empty, or left as the `.env.example` placeholder → the app falls back to links automatically ([`src/lib/maps/config.ts`](src/lib/maps/config.ts)). |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Optional | A Map ID is required for the colored pin markers (Advanced Markers) the app uses. Falls back to Google's public `DEMO_MAP_ID`, which works but is watermarked/rate-limited — create your own for real use. |

**In Google Cloud Console:**

1. Create or select a project, then enable **billing** on it (Maps JavaScript API requires a billing account; Google gives a recurring free monthly credit — see [Costs](#costs)).
2. **APIs & Services → Library** → enable **Maps JavaScript API**.
3. **APIs & Services → Credentials → Create credentials → API key.** Then click the new key and restrict it:
   - **Application restrictions:** *Websites* → add your domain(s), e.g. `https://your-app.vercel.app/*`, `https://your-custom-domain.com/*`, and (only while developing) `http://localhost:3000/*`.
   - **API restrictions:** *Restrict key* → select only **Maps JavaScript API**.
4. **Google Maps Platform → Map Management → Create Map ID** — Map type **JavaScript**, and turn **on** vector rendering (required for Advanced Markers, which is what the bus/hotel/stop pins use). Copy the Map ID.
5. Put the key in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and the Map ID in `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.

**In Vercel:** Project → **Settings → Environment Variables** → add both for whichever environments should have the embedded map (Production/Preview/Development), then **redeploy** (`NEXT_PUBLIC_*` values are baked in at build time — changing them needs a new build, not just a restart). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) § Vercel environment variables.

A revoked/invalid key, or one restricted to the wrong domain, makes the map show a translated "could not be loaded" message with the Google Maps link underneath — it never crashes the page or silently shows a blank map.

## Costs

No SMS, OTP, realtime or map fees are required. Remaining possible costs are hosting, database, and an optional custom domain. Free tiers have limits and terms that change — **verify them before relying on them**:

- **Vercel Hobby** is for personal, non-commercial use; a commercial event operation may need a paid plan. Function invocations and CPU time are limited: 2,000 attendees polling every 20 s ≈ 6,000 requests/minute, which a free plan may not sustain for a full event day.
- **Neon free tier** limits compute hours and storage; polling and GPS writes consume compute.
- See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) › Cost review.

## Coordinator: running a trip

1. Sign in → **Start trip** on your bus.
2. Tap the large status buttons. If two phones disagree, the older one is told the status changed.
3. **Start sharing location** and allow location access. Keep the page open with the screen on; phones pause websites when locked or in the background.
4. **End trip** when done.

**GPS limits:** a website can't track reliably in the background; continuous background tracking would need a native app. Laptops often have no GPS: they report approximate Wi-Fi positions, which the app flags as approximate.

## Managing hotels, coordinators, attendees and buses

Pick an event (Owner/Admin → **Events** → switch), then use either:

- **Manual forms** — Hotels, Buses, Coordinators and People (which covers both attendee and coordinator accounts) each have **Add**/edit pages with assignment controls (hotel ↔ coordinator, bus ↔ hotel, attendee ↔ hotel). Reached from the bottom nav / top bar as Owner or Admin.
- **Bulk import** (Owner/Admin → **Import** in the nav) — upload a `.csv` or `.xlsx` file to create many records at once.
  1. Choose what you're importing and download the sample file for the exact column names (the **Import** page shows required vs. optional columns for the selected type).
  2. Upload your file and click **Preview** — nothing is written yet. The preview lists, per row, whether it's ready to import, a duplicate (skipped), or has an error (with the row number and what's wrong).
  3. Fix and re-upload if needed, or click **Import** to write the rows that passed. The result reports how many were created, added to this event (an existing person joining from another event), skipped as duplicates, or failed.

  **Columns:**

  | Entity | Required | Optional |
  | --- | --- | --- |
  | Hotels | `name`, `address` | `latitude`, `longitude`, `notes` |
  | Coordinators (Owner only) | `name`, `phone` | `hotelName` (designates them coordinator of that hotel) |
  | Attendees | `name`, `phone` | `hotelName` (their room allotment) |
  | Buses | `label`, `hotelName` | `registration`, `routeNotes`, `coordinatorPhone` |

  **Matching/duplicate rules:** hotels are matched by exact name (case-insensitive) within the event; a second row with the same name is skipped as a duplicate. Buses with a registration number are matched by registration (globally unique); without one, by hotel + label. People are matched by phone number, which is unique across the whole app, not per event — a phone already registered for *this* event is skipped as a duplicate, the same phone registered for a *different* event joins this one too (not a duplicate), and a phone already belonging to a different role is reported as an error rather than silently skipped. `hotelName` must exactly match (case-insensitive) one active hotel already in the event — create hotels first, or import them in a separate earlier run.

  **`coordinatorPhone` (buses, optional):** assigns that bus's default coordinator — the same "assign coordinator" action as the manual bus-edit page, so it's **Owner only** (same rule as importing Coordinators). It must match the phone number of an *existing, active* coordinator already registered for the event, so import Coordinators before Buses if you're using this column. If an Admin's file has values in this column, those rows are reported as errors rather than silently dropping the assignment — leave the column blank (or out of the file) for an Admin-run buses import. A coordinator can be the default coordinator of more than one bus.

  **Limits:** 5 MB per file, 2,000 data rows per file (split larger lists into multiple imports). Only Owner/Admin can import; importing Coordinators needs Owner (the same rule as creating a coordinator manually).

## Data retention

`npm run ops:prune` (daily via Vercel Cron in production) deletes GPS history older than the retention setting (default 7 days), old sessions and expired rate-limit counters.

## Environment variables

All configuration lives in `.env` (git-ignored). `.env.example` lists every variable with placeholders only.

| Variable | Needed | Where to get it |
| --- | --- | --- |
| `APP_URL` | yes | Your site's URL |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` | yes | Local: you choose. Production: your Postgres provider |
| `DIRECT_DATABASE_URL` | production, optional | Direct (non-pooled) DB connection for migrations |
| `CRON_SECRET` | production | `openssl rand -hex 32` |
| `NEXT_PUBLIC_GOOGLE_MAPS_*` | optional | Google Cloud (billing account required) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint + type-check + all tests |
| `npm run test:unit` / `npm run test:integration` | Unit tests / integration tests (need `TEST_DATABASE_URL`) |
| `npm run owner:create -- …` | Create the first Owner or reset an Owner PIN (you then choose the PIN at sign-in) |
| `npm run ops:prune` | Data-retention cleanup |
| `npm run vercel-build` | Vercel build: migrations (production only) + `next build` |
| `npx tsx scripts/loadtest-seed.ts` | Load-test data + session tokens (local/staging DBs only) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run db:migrate` / `npm run db:deploy` | Migrations (development / production) |
| `npm run db:studio` | Browse the database |

## GitHub workflow

- Work on a feature branch, open a pull request into `main`. CI runs migrations, lint, type-check, tests and a production build.
- Never commit `.env` or credentials. Never force-push.

## Common problems

- **`Invalid environment configuration: …`**: a variable in `.env` is missing or malformed; the message names it.
- **Database connection refused**: start Docker Desktop, then `npm run db:up`.
- **Pages keep reloading, or a form says an action is undefined, in development**: stop `npm run dev`, delete `.next`, start again. Avoid running `npm run build`/`typecheck` while the dev server runs.
- **"Too many attempts" at sign-in**: wait 15 minutes (lockout/rate limit).
- **Integration tests skipped**: set `TEST_DATABASE_URL` (its database name must contain `test` or `ci`).

## Security, deployment, more docs

- [docs/SECURITY.md](docs/SECURITY.md): sign-in model, permissions, residual risks
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Vercel + Neon setup, migrations, first Owner, smoke test, cost review
- [docs/OPERATIONS.md](docs/OPERATIONS.md): monitoring, event-day checklist, troubleshooting, load testing
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE.md](docs/DATABASE.md), [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) (original brief), [PROJECT_MEMORY.md](PROJECT_MEMORY.md)

## Current limitations

GPS sharing works only while the coordinator's page is open and on screen; not yet tested on a real phone. Attendee pages update every 20 s (no push). Attendee sign-in uses only the phone number, so someone who knows an attendee's number and event can view that attendee's (read-only) page. No road-route drawing. Accessibility checked by hand, not with assistive-technology users.
