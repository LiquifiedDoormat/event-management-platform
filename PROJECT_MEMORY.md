# PROJECT_MEMORY.md — canonical AI / developer handover

_Last updated: 2026-10-18 (end of Phase 1), branch `feat/phase-1-foundation`._

The repository's verified state takes precedence over this file. If they disagree, fix this file first.

---

## 1. Project Overview

- **Purpose:** Mobile-first, bilingual (English/Hindi) event management web app for hotels, hotel coordinators, buses and attendees, with coordinator-controlled live bus GPS tracking.
- **Account types (roles):** `OWNER` (everything incl. reassignment, roles, config), `ADMIN` (view/manage operational records, no Owner powers), `COORDINATOR` (their designated hotel + buses/trips they are assigned to; controls bus status and GPS sharing), `CUSTOMER` (attendee: own profile + own hotel, its coordinator and its buses only).
  - The brief lists three account types; `COORDINATOR` is a separate role so coordinators get least-privilege trip control instead of Admin rights. See `docs/ARCHITECTURE.md`.
- **Scale target:** 16,000+ registered users, 2,000+ concurrent. Not yet tested.
- **Stack:** Next.js 16.4 (App Router, TypeScript strict, Turbopack), Tailwind CSS 4, next-intl 4, Zod 4, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17, Vitest 4. Planned: Twilio Verify (OTP), Pusher Channels (realtime), Google Maps JS API (`@vis.gl/react-google-maps`), React Hook Form, k6, Playwright.
- **Package manager:** npm (commit `package-lock.json`; don't mix managers). Node ≥ 22 (developed on Node 26).

## 2. Current Project Status

- **Stage:** Phase 1 (Foundation) complete. Phase 2 not started.
- **Completed:** Project scaffold, i18n routing (en/hi), base layout + language switcher, env validation, Prisma schema + first migration (with hand-written constraints), dev seed, health endpoint, security headers, unit tests, CI workflow, docs.
- **Partially implemented:** none.
- **Not started:** auth/OTP/sessions, authorization policies, Owner bootstrap, all entity CRUD/directories/detail pages, dashboards, trips/status, GPS, realtime, maps, load tests, deployment.
- **Broken/blocked:** nothing broken. External accounts (Twilio, Pusher, Google Maps, managed Postgres, Vercel) don't exist yet; they're needed only from Phase 2/4/5/7.
- **CI:** `.github/workflows/ci.yml` written but **not yet run on GitHub** (first run happens when this branch is pushed / PR opened).

## 3. Repository Structure

```
.github/workflows/ci.yml   CI: npm ci → migrate deploy → lint → typecheck → test → build (Postgres service)
docs/                      ARCHITECTURE.md, DATABASE.md, SECURITY.md (DEPLOYMENT/OPERATIONS come in Phase 7)
messages/en.json, hi.json  All UI strings (next-intl). Keep keys identical in both files.
prisma/schema.prisma       Data model (generator output → src/generated/prisma, git-ignored)
prisma/migrations/         Committed migrations. init includes hand-written partial index + CHECKs
prisma/seed.ts             Local-only demo data (refuses non-localhost DATABASE_URL)
prisma.config.ts           Prisma 7 config: schema path, migrations, seed, DATABASE_URL
scripts/init-test-db.sql   Creates event_test DB on first Docker volume init
docker-compose.yml         Local Postgres (password from .env)
src/proxy.ts               Next 16 "proxy" (was middleware): next-intl locale routing ONLY, not auth
src/i18n/                  routing.ts (locales), request.ts (message loading), navigation.ts (Link/redirect)
src/app/[locale]/          layout.tsx (html/body, fonts, header), page.tsx (landing placeholder)
src/app/api/health/        GET → {ok, database}; 503 if DB down
src/app/globals.css        Tailwind 4 theme tokens (palette, fonts), base font 112.5%
src/components/layout/     LanguageSwitcher (client)
src/config/env.ts          Zod env validation; refuses OTP_PROVIDER=dev in production
src/lib/db/prisma.ts       Lazy singleton PrismaClient (Proxy) — created on first use, not at import
src/lib/utils/phone.ts     normalizePhone (E.164; Indian numbers must be mobile), maskPhone
tests/unit/                Vitest unit tests; tests/stubs/server-only.ts stubs "server-only"
AGENTS.md                  Auto-maintained by `next dev` (Next.js agent rules). Don't hand-edit inside its markers.
```

Planned locations (create when needed): auth → `src/lib/auth/`, authorization → `src/server/policies/`, services → `src/server/services/`, validation → `src/lib/validation/`, realtime → `src/lib/realtime/`, maps → `src/lib/maps/` + `src/components/maps/`, rate limiting → `src/lib/rate-limit/`.

## 4. Architecture and Data Model

- Full details: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`.
- **Entities:** User, Hotel, Bus, BusStop, Trip, BusLocation (latest per bus), LocationPoint (sampled history), BusStatusEvent, Session, RateLimitBucket, AuditLog, EventConfig (single row).
- **Key rules in the DB:** one designated coordinator per hotel (`Hotel.coordinatorId` unique); bus belongs to one hotel; one active trip per bus (partial unique index); E.164 phones; coordinate range CHECKs.
- **Authorization (planned):** every server entry point → `requireSession()` → active account → role check → scope check (policy) → Zod validation. Customer scope = `User.hotelId` read per request.
- **Sessions (planned):** random token cookie (HttpOnly, Secure, SameSite=Lax), SHA-256 hash in `Session`; revocation on sign-out/deactivation.
- **GPS flow (planned):** coordinator browser `watchPosition` → throttled POST `/api/locations` → authz + validate → conditional upsert `BusLocation` (newer `recordedAt` only) → sampled `LocationPoint` → publish to Pusher `private-bus-{busId}` → authorized subscribers. HTTP fetch fallback; stale threshold from `EventConfig`.
- **API endpoints:** only `GET /api/health` exists.

## 5. Completed Features

| Feature | Status | How verified |
| --- | --- | --- |
| Next.js app runs (dev + production build) | Verified | `npm run build` passed; `npm run dev` served pages |
| en/hi locale routing + language switcher | Verified | Browser: `/hi` renders Devanagari correctly at 375px; switching to English works; choice remembered (`/` → `/hi` after visiting `/hi`) |
| Health endpoint | Verified | `curl /api/health` → `200 {"ok":true,"database":"up"}` |
| Security headers | Verified | Present on responses (curl) |
| Prisma schema + migration | Verified | `prisma migrate dev` applied to local Postgres 17; `migrate status` up to date |
| DB constraints | Verified | Manual SQL: 2nd active trip on a bus rejected; lat=91 rejected; non-E.164 phone rejected |
| Dev seed | Verified | Ran twice; 13 users both times (idempotent) |
| Env validation | Verified | Unit tests (4) |
| Phone normalization | Verified | Unit tests (10) |
| CI workflow | **Unverified** | Not yet run on GitHub |

## 6. Outstanding Tasks (prioritized)

- [ ] **Phase 2 — Auth & authorization** (next)
  - [ ] `OtpProvider` interface + `dev` and `twilio` implementations (`src/lib/auth/otp/`)
  - [ ] Rate limiter on `RateLimitBucket` (`src/lib/rate-limit/`)
  - [ ] Session create/validate/revoke + cookie helpers; `requireSession`, `requireRole`
  - [ ] Login page (phone → OTP) with en/hi strings, generic responses; sign-out
  - [ ] Role-based redirect to `/[locale]/owner|admin|coordinator|customer`
  - [ ] Owner bootstrap script `scripts/create-owner.ts` (CLI only)
  - [ ] Policies for hotel/bus/person scope + tests (integration tests against `TEST_DATABASE_URL`)
- [ ] Phase 3 — Hotels, coordinators, buses, people: directories (paginated), detail pages, Owner/Admin dashboards, assignments with audit log. Depends on Phase 2.
- [ ] Phase 4 — Customer dashboard + Google Maps. Depends on 2, 3.
- [ ] Phase 5 — Trips, status controls, GPS sharing, Pusher realtime, stale detection, retention job. Depends on 2–4.
- [ ] Phase 6 — Complete translations, accessibility, mobile polish.
- [ ] Phase 7 — Deployment (Vercel + managed Postgres), DEPLOYMENT.md/OPERATIONS.md, k6 load tests, CSP header.

## 7. Current Development State

- **Last completed task:** Phase 1 foundation (this commit).
- **In progress:** nothing.
- **Next recommended task:** Phase 2, starting with the `OtpProvider` interface + `dev` provider, sessions and the login page, then authorization policies with integration tests.
- **Incomplete changes:** none.
- **Check results (2026-10-18, local):** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 14/14, `npm run build` ✅.

## 8. Setup and Execution

```bash
npm install                      # also runs prisma generate
cp .env.example .env             # then set POSTGRES_PASSWORD and the same password in both DB URLs
npm run db:up                    # Docker Postgres 17 on :5432 (creates event_dev + event_test)
npm run db:migrate               # apply migrations
npm run db:seed                  # optional local demo data
npm run dev                      # http://localhost:3000
npm run check                    # lint + typecheck + unit tests
npm run build                    # production build
```

Env var names and where to get values: see `.env.example` and README.

## 9. Environment and External Services

| Service | Status |
| --- | --- |
| GitHub `LiquifiedDoormat/event-management-platform` (public) | Connected; `main` pushed. Pushes use the `LiquifiedDoormat` account via `gh auth setup-git`. Commits authored as `LiquifiedDoormat <324446387+LiquifiedDoormat@users.noreply.github.com>` (repo-local git config). |
| PostgreSQL | Local Docker only. Managed provider not chosen/created. |
| Phone OTP (Twilio Verify) | Not set up. `OTP_PROVIDER=dev` locally. |
| Realtime (Pusher Channels) | Not set up. |
| Google Maps Platform | Not set up. |
| Vercel | Not set up. |

## 10. Known Issues and Risks

- Prisma's npm `latest` tag currently points to `8.0.0-rc.23`; we pin stable **7.10.1** deliberately. Don't run `npm i prisma@latest` without checking.
- Next.js 16 differs from older versions (`proxy.ts` instead of `middleware.ts`, `PageProps`/`LayoutProps` globals from `next typegen`). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `cacheComponents` (enabled by create-next-app) was turned **off** to keep per-user dynamic pages simple.
- `next build` runs with `NODE_ENV=production`; anything that reads env at import time breaks the build. Read env lazily (see `src/lib/db/prisma.ts`).
- Mobile browsers suspend JS when the screen locks, so GPS sharing needs the page open (documented in ARCHITECTURE).
- No Content-Security-Policy yet (planned once Maps/Pusher origins are known).
- Load/scale targets unverified.

## 11. Change History

- **2026-10-18 — Repository setup** (`main`, d82e1b1): `.gitignore`, `.env.example`, README, this file.
- **2026-10-18 — Phase 1 foundation** (`feat/phase-1-foundation`):
  - Added: Next.js 16 app (`src/app`, `src/i18n`, `src/proxy.ts`, `src/components/layout/LanguageSwitcher.tsx`), `messages/`, `src/config/env.ts`, `src/lib/db/prisma.ts`, `src/lib/utils/phone.ts`, `src/app/api/health/route.ts`, `prisma/` (schema, init migration, seed), `prisma.config.ts`, `docker-compose.yml`, `scripts/init-test-db.sql`, `vitest.config.ts`, `tests/`, `.github/workflows/ci.yml`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `AGENTS.md`.
  - Dependencies: next 16.4.2, react 19.3, next-intl 4, @prisma/client + @prisma/adapter-pg 7.10.1, zod 4, libphonenumber-js, server-only; dev: prisma 7.10.1, typescript 5, eslint 9 + eslint-config-next, tailwindcss 4 + @tailwindcss/turbopack, vitest 4, tsx, dotenv.
  - Schema: migration `20261018133949_init` (all models above + partial unique index + CHECK constraints).
  - Decisions: COORDINATOR role; Twilio Verify; Pusher; DB-backed rate limiting; own session table; cacheComponents off; Indian numbers must be mobile.

## 12. Instructions for the Next AI

1. Read this file, then `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `AGENTS.md`.
2. Run `git status`, `git log --oneline -10`, and check the current branch.
3. Verify state: `npm install && npm run db:up && npm run db:migrate && npm run check && npm run build`.
4. Constraints: never commit `.env` or secrets; never force-push; never reset/drop the production DB; enforce authorization on the server; don't mark features verified without running checks; keep `messages/en.json` and `hi.json` keys in sync; update this file after each milestone.
5. **Next concrete action:** Phase 2, step 1: create `src/lib/auth/otp/{types,dev,twilio,index}.ts` and `src/lib/rate-limit/index.ts`, then sessions and the login page.
