# Event Management Platform

Mobile-first, English/Hindi web app for running event logistics: hotels, hotel coordinators, buses and attendees, with live bus tracking shared from the coordinator's phone.

> **Status:** Phase 1 (foundation) is done: app shell, bilingual routing, database schema and CI. Sign-in, dashboards, maps and live tracking are **not built yet**. See [PROJECT_MEMORY.md](PROJECT_MEMORY.md) for exact progress.

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

## Environment variables

All configuration lives in `.env` (git-ignored). `.env.example` lists every variable with placeholders only. Variables starting with `NEXT_PUBLIC_` are visible in the browser, so never put secrets in them. The app validates its configuration on first use and reports which variable names are missing or invalid.

| Variable | Needed from | Where to get it |
| --- | --- | --- |
| `APP_URL` | now | Your site's URL |
| `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` | now | Local: you choose. Production: your managed Postgres provider |
| `OTP_PROVIDER`, `TWILIO_*` | Phase 2 | Twilio Console → Verify → Services |
| `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*` | Phase 5 | Pusher dashboard → Channels app → App Keys |
| `NEXT_PUBLIC_GOOGLE_MAPS_*` | Phase 4 | Google Cloud Console → APIs & Services → Credentials |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run check` | Lint + type-check + unit tests |
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
- **Password mismatch after changing `.env`**: the Docker volume keeps the first password. Change it back, or `docker compose down -v` to recreate the local DB (this deletes local data).

## Security

See [docs/SECURITY.md](docs/SECURITY.md). Access control is enforced on the server; the `dev` OTP provider is refused in production.

## More documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, decisions, GPS data flow
- [docs/DATABASE.md](docs/DATABASE.md): data model, constraints, migration policy
- [docs/SECURITY.md](docs/SECURITY.md): auth, secrets, headers, privacy
- [PROJECT_MEMORY.md](PROJECT_MEMORY.md): development state and handover

## Current limitations

No sign-in, dashboards, maps or live tracking yet. Live tracking (when built) works only while the coordinator keeps the page open; phones pause websites in the background.
