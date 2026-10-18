# PROJECT_MEMORY.md — canonical AI / developer handover

_Last updated: 2026-10-18 (end of Phase 2), branch `feat/phase-2-auth` (based on `feat/phase-1-foundation`, PR #1)._

Requirements: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) is the full, canonical project brief.

The repository's verified state takes precedence over this file. If they disagree, fix this file first.

---

## 1. Project Overview

- **Purpose:** Mobile-first, bilingual (English/Hindi) event management web app for hotels, hotel coordinators, buses and attendees, with coordinator-controlled live bus GPS tracking.
- **Account types (roles):** `OWNER` (everything incl. reassignment, roles, config), `ADMIN` (view/manage operational records, no Owner powers), `COORDINATOR` (their designated hotel + buses/trips they are assigned to; controls bus status and GPS sharing), `CUSTOMER` (attendee: own profile + own hotel, its coordinator and its buses only).
  - The brief lists three account types; `COORDINATOR` is a separate role so coordinators get least-privilege trip control instead of Admin rights. See `docs/ARCHITECTURE.md`.
- **Scale target:** 16,000+ registered users, 2,000+ concurrent. Not yet tested.
- **Stack:** Next.js 16.4 (App Router, TypeScript strict, Turbopack), Tailwind CSS 4, next-intl 4, Zod 4, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17, Vitest 4. OTP: Twilio Verify (REST, no SDK) behind `OtpProvider`. Planned: Pusher Channels (realtime), Google Maps JS API (`@vis.gl/react-google-maps`), k6, Playwright.
- **Package manager:** npm (commit `package-lock.json`; don't mix managers). Node ≥ 22 (developed on Node 26).

## 2. Current Project Status

- **Stage:** Phase 2 (database + authentication + authorization) complete on branch `feat/phase-2-auth`. Phase 3 not started.
- **Completed:** Phase 1 foundation; phone OTP login (dev + Twilio providers), DB-backed rate limiting, server-side sessions with sign-out/revocation, role-based + relationship-based authorization policies, scope loader, Owner bootstrap script, login page, role homepages (Owner/Admin overview with counts and missing assignments; Coordinator: designated hotel + buses; Customer: own hotel, coordinator call button, buses), sign-out, en/hi strings for all of it.
- **Partially implemented:** Role homepages are summaries only (no directories, maps, live status yet).
- **Not started:** hotel/bus/person CRUD, directories + detail pages, assignment management UI, audit log viewer, trips/status UI, GPS, realtime, maps, load tests, deployment.
- **Broken/blocked:** nothing broken. Twilio is **implemented but unverified** (no Twilio account yet). Pusher, Google Maps, managed Postgres and Vercel accounts don't exist yet.
- **CI:** passed on PR #1 (Phase 1). Phase 2's CI run happens when this branch is pushed / its PR is opened.

## 3. Repository Structure

```
.github/workflows/ci.yml        CI: npm ci → migrate deploy → lint → typecheck → test (unit + integration) → build
docs/MASTER_PROMPT.md           Full project requirements (canonical brief, verbatim). Read before any work.
docs/                           ARCHITECTURE.md, DATABASE.md, SECURITY.md (permission matrix, auth details)
messages/en.json, hi.json       All UI strings (next-intl). Keep keys identical in both files.
prisma/schema.prisma            Data model (generator output → src/generated/prisma, git-ignored)
prisma/migrations/              Committed migrations. init includes hand-written partial index + CHECKs
prisma/seed.ts                  Local-only demo data (refuses non-localhost DATABASE_URL). Never creates an Owner
prisma.config.ts                Prisma 7 config: schema path, migrations, seed, DATABASE_URL
scripts/create-owner.ts         CLI-only Owner bootstrap (npm run owner:create)
scripts/init-test-db.sql        Creates event_test DB on first Docker volume init
docker-compose.yml              Local Postgres (password from .env)
src/proxy.ts                    Next 16 "proxy" (was middleware): next-intl locale routing ONLY, not auth
src/i18n/                       routing.ts, request.ts, navigation.ts (locale-aware Link/redirect/useRouter)
src/app/[locale]/layout.tsx     html/body, fonts, header (language switcher + sign-out when signed in)
src/app/[locale]/page.tsx       Redirects to role home or /login
src/app/[locale]/login/         Login page (server) → components/auth/LoginForm (client, 2 steps)
src/app/[locale]/{owner,admin,coordinator,customer}/page.tsx   Role homepages (requireUser with role list)
src/app/api/auth/otp/request    POST {phone} → {sent:true} (generic) | invalid_phone | rate_limited | provider_unavailable
src/app/api/auth/otp/verify     POST {phone, code} → sets session cookie, {redirectTo}
src/app/api/auth/logout         POST → revokes session, clears cookie
src/app/api/health              GET → {ok, database}
src/components/auth/            LoginForm, SignOutButton
src/components/layout/          LanguageSwitcher, StatTile, EventOverview (Owner/Admin summary)
src/config/env.ts               Zod env validation; refuses OTP_PROVIDER=dev in production
src/lib/api/                    response.ts (JSON envelope + error codes), request.ts (isSameOrigin, clientIp, readJson)
src/lib/auth/otp/               types.ts (OtpProvider), dev.ts, twilio.ts, index.ts (picks provider from env)
src/lib/auth/session.ts         create/validate/revoke sessions; cookie name/options
src/lib/auth/current-user.ts    getCurrentUser (per-request cache), requireUser (pages), getApiUser (routes)
src/lib/rate-limit/             Fixed-window DB rate limiter + AUTH_LIMITS
src/lib/db/prisma.ts            Lazy singleton PrismaClient (Proxy), created on first use
src/lib/utils/                  phone.ts (normalizePhone: Indian numbers must be mobile; maskPhone), crypto.ts
src/server/policies/index.ts    ALL authorization rules (pure functions): can(), assignableRoles, canEditPerson, canView*, canSendLocation, canChangeStatus, canStartTrip
src/server/policies/scope.ts    loadScope(actor): hotels/buses a coordinator/customer relates to (fresh per request)
src/server/services/auth.ts     requestOtp, verifyOtp, logout, roleHome
src/server/services/dashboard.ts  getEventOverview (staff), getCustomerOverview, getCoordinatorOverview
tests/setup.ts                  Points DATABASE_URL at TEST_DATABASE_URL (name must contain test/ci) or a dead URL
tests/global-setup.ts           prisma migrate deploy on the test DB
tests/unit/                     env, phone, policies
tests/integration/              auth, authorization, create-owner (+ helpers.ts: resetDb, fixtures)
AGENTS.md                       Next.js agent rules (auto-maintained block) + pointer to this file
```

Planned locations: validation schemas → `src/lib/validation/`, realtime → `src/lib/realtime/`, maps → `src/lib/maps/` + `src/components/maps/`, entity UI → `src/components/{hotels,buses,people}/`, services → `src/server/services/{hotels,buses,people,trips}.ts`.

## 4. Architecture and Data Model

- Full details: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md` (has the permission matrix).
- **Entities:** User, Hotel, Bus, BusStop, Trip, BusLocation (latest per bus), LocationPoint (sampled history), BusStatusEvent, Session, RateLimitBucket, AuditLog, EventConfig (single row). No schema changes in Phase 2.
- **Request pattern (use for every new endpoint/page):** `getApiUser()`/`requireUser()` → `isSameOrigin()` for mutations → Zod-parse input → `loadScope()` if non-staff → policy check (`can`/`canView*`) → service → `ok()`/`fail()`.
- **Auth flow:** phone → `normalizePhone` → rate limits → active user lookup (unknown/inactive numbers: generic "sent", no SMS) → `OtpProvider.send` → code → `OtpProvider.check` → `createSession` (random token cookie, SHA-256 in DB) → audit `auth.login` → redirect to role home.
- **Sessions:** cookie `__Host-session` (prod) / `session` (dev), HttpOnly, SameSite=Lax, 365-day cookie; validity = DB `expiresAt` (30 days of inactivity, renewed ≤ once/day). User row re-read every request.
- **API envelope:** `{ok:true,data}` / `{ok:false,error:{code}}`, `Cache-Control: no-store`. Codes in `src/lib/api/response.ts`; client maps them to `auth.errors.*` strings.
- **GPS flow (planned, Phase 5):** see `docs/ARCHITECTURE.md`. Policies `canSendLocation` / `canChangeStatus` / `canStartTrip` already exist and are tested.

## 5. Completed Features

| Feature | Status | How verified |
| --- | --- | --- |
| Next.js app, en/hi routing, language switcher | Verified | Phase 1 browser checks; build passes |
| Prisma schema, migration, constraints, seed | Verified | Phase 1 (migrate, manual SQL constraint tests, idempotent seed) |
| Health endpoint, security headers, env validation | Verified | curl + unit tests |
| Phone normalization | Verified | Unit tests |
| OTP login with `dev` provider | Verified | Integration tests + manual browser login (attendee) on 375px viewport + API login (owner) |
| OTP login with `twilio` provider | **Implemented, unverified** | No Twilio account. Code path not exercised by tests |
| Generic responses (no enumeration) | Verified | Integration test: unknown/inactive numbers get `sent`, no code issued |
| Rate limiting (send/verify per phone + IP) | Verified | Integration tests (6th send blocked; 9th verify blocked) |
| Sessions: persistence, expiry, garbage tokens, hash-only storage | Verified | Integration tests |
| Sign-out / revoke all / deactivation ends sessions | Verified | Integration tests + browser sign-out |
| HttpOnly cookie | Verified | Browser `document.cookie` has no session; curl cookie jar flag |
| CSRF origin check | Verified | curl with foreign Origin → 403 |
| Role guard on pages | Verified | Browser: customer → `/en/owner` redirected to `/en/customer`; signed-out → `/login` |
| Authorization policies (role matrix) | Verified | Unit tests (owner-only actions, no OWNER grant, admin can't edit staff) |
| Relationship scoping (customer/coordinator) | Verified | Integration tests (other hotel/bus/attendee denied; hotel reassignment immediate; GPS only from trip coordinator) |
| Owner bootstrap script | Verified | Integration tests (first owner, refuse second, --allow-additional, --promote-existing, bad input) + manual run on dev DB |
| Role homepages | Verified (basic) | Browser (customer, en + hi), curl (owner) |
| CI workflow | Verified for Phase 1 | Phase 2 run pending |

## 6. Outstanding Tasks (prioritized)

- [x] Phase 1 — Foundation
- [x] Phase 2 — Auth & authorization (Twilio live test still pending; needs account)
- [ ] **Phase 3 — Core administration** (next; depends on Phase 2)
  - [ ] Validation schemas (`src/lib/validation/`) for hotel, bus, stop, person
  - [ ] Services with transactions + audit log: hotels, buses (+ stops), people (provision, edit, deactivate → `revokeAllSessions`), assignments (attendee→hotel, coordinator→hotel, bus→hotel; Owner-only)
  - [ ] Paginated, searchable directories (cursor-based) + detail pages for hotels, coordinators, buses, people; mobile cards, desktop tables
  - [ ] Bottom/top navigation per role; Owner/Admin dashboards link into directories
  - [ ] Integration tests for each service's permission checks
- [ ] Phase 4 — Customer dashboard + Google Maps (needs Maps key). Depends on 3.
- [ ] Phase 5 — Trips, status controls, GPS sharing, Pusher realtime, stale detection, retention job (needs Pusher account). Depends on 3–4.
- [ ] Phase 6 — Complete translations audit, accessibility, mobile polish.
- [ ] Phase 7 — Deployment (Vercel + managed Postgres), DEPLOYMENT.md/OPERATIONS.md, k6 load tests, CSP header, cleanup job for expired sessions/rate-limit rows, Twilio live verification.

## 7. Current Development State

- **Last completed task:** Phase 2 (this branch).
- **In progress:** nothing.
- **Next recommended task:** Phase 3, starting with hotels (validation schema → service with policy checks + audit → directory + detail page → tests), then buses/stops, people, assignments.
- **Incomplete changes:** none.
- **Check results (2026-10-18, local):** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 52/52 (6 files: 3 unit, 3 integration against `event_test`), `npm run build` ✅.
- **Merge order:** PR #1 (`feat/phase-1-foundation`) must merge before the Phase 2 PR (stacked branch).

## 8. Setup and Execution

```bash
npm install                      # also runs prisma generate
cp .env.example .env             # set POSTGRES_PASSWORD and the same password in DATABASE_URL + TEST_DATABASE_URL
npm run db:up                    # Docker Postgres 17 on :5432 (creates event_dev + event_test)
npm run db:migrate               # apply migrations to dev DB
npm run db:seed                  # optional local demo data
npm run owner:create -- --phone "<mobile>" --name "<name>"   # first Owner
npm run dev                      # http://localhost:3000 ; dev OTP codes print in this terminal
npm run check                    # lint + typecheck + all tests (integration tests need TEST_DATABASE_URL)
npm run build                    # production build
```

Local demo accounts after seeding (fake numbers): admin `9999900002`; coordinators `9999900010`, `9999900011`; attendees `9999900100–104`, `9999900110–114`. The developer's local dev DB also has a Demo Owner `9999900001` (created with the script, not by the seed).

## 9. Environment and External Services

| Service | Status |
| --- | --- |
| GitHub `LiquifiedDoormat/event-management-platform` (public) | Connected. PR #1 open (Phase 1, CI passed, Auto-fix on). Pushes use `LiquifiedDoormat` via `gh auth setup-git`. Commits authored as `LiquifiedDoormat <324446387+LiquifiedDoormat@users.noreply.github.com>` (repo-local git config). |
| PostgreSQL | Local Docker only. Managed provider not chosen/created. |
| Phone OTP | `dev` provider locally. Twilio Verify implemented; **account not created, untested**. Env: `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Setup steps + pricing notes in README. |
| Realtime (Pusher Channels) | Not set up. |
| Google Maps Platform | Not set up. |
| Vercel | Not set up. |

## 10. Known Issues and Risks

- Prisma's npm `latest` tag points to `8.0.0-rc.23`; we pin stable **7.10.1** deliberately.
- Next.js 16 differs from older versions (`proxy.ts`, `PageProps`/`LayoutProps` from `next typegen`, async `cookies()`). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `cacheComponents` is off; all role pages are dynamic (they read cookies).
- `next build` runs with `NODE_ENV=production`; never read env at import time (see `src/lib/db/prisma.ts`).
- OTP request timing differs slightly between registered and unregistered numbers (only registered ones call the SMS provider). Low risk; document if it matters.
- The `dev` OTP store is in-memory per process; fine locally, refused in production.
- Expired `Session` and `RateLimitBucket` rows are not yet cleaned up (needs a scheduled job; Phase 7).
- In the browser tool, clicking by screen coordinates at 375px emulation missed the target once; use element refs when automating.
- Mobile browsers suspend JS when the screen locks, so GPS sharing needs the page open (documented in ARCHITECTURE).
- No Content-Security-Policy yet. Load/scale targets unverified.

## 11. Change History

- **2026-10-18 — Repository setup** (`main`, d82e1b1): `.gitignore`, `.env.example`, README, this file.
- **2026-10-18 — Phase 1 foundation** (`feat/phase-1-foundation`, 5cb6138; PR #1): Next.js 16 app, i18n, Prisma schema + init migration (partial unique index, CHECKs), seed, env validation, phone utils, health endpoint, security headers, CI, docs. Decisions: COORDINATOR role; Twilio Verify; Pusher; DB rate limiting; own session table; cacheComponents off; Indian numbers must be mobile.
- **2026-10-18 — Master prompt saved** (`feat/phase-1-foundation`, bf3a3c1): `docs/MASTER_PROMPT.md`; secret-hygiene audit (`.env` never committed; `.env.example` placeholders only; CI `ci:ci` creds only for the throwaway CI database).
- **2026-10-18 — Phase 2 auth & authorization** (`feat/phase-2-auth`):
  - Added: `src/lib/auth/{otp/*,session.ts,current-user.ts}`, `src/lib/rate-limit/index.ts`, `src/lib/api/{response,request}.ts`, `src/lib/utils/crypto.ts`, `src/server/policies/{index,scope}.ts`, `src/server/services/{auth,dashboard}.ts`, API routes `auth/otp/request`, `auth/otp/verify`, `auth/logout`, pages `login`, `owner`, `admin`, `coordinator`, `customer`, components `auth/LoginForm`, `auth/SignOutButton`, `layout/StatTile`, `layout/EventOverview`, `scripts/create-owner.ts`, tests (`tests/setup.ts`, `tests/global-setup.ts`, `tests/unit/policies.test.ts`, `tests/integration/*`).
  - Changed: `[locale]/layout.tsx` (sign-out in header, reads current user), `[locale]/page.tsx` (redirect by role), `messages/*.json` (auth + dashboard strings; removed old `home` landing strings), `vitest.config.ts` (setup files, serial files), `package.json` (scripts `test:unit`, `test:integration`, `owner:create`), CI (`TEST_DATABASE_URL`), README, SECURITY.md.
  - No new dependencies. No schema changes.
  - Decisions: Twilio via REST (no SDK); dev provider prints codes; generic OTP responses; 30-day sliding sessions with long-lived cookie; OWNER never assignable in-app; Admins provision Customers only; Admins/Owner may correct bus status; GPS only from the trip coordinator; coordinators may view attendees of hotels in their scope.

## 12. Instructions for the Next AI

1. Read `docs/MASTER_PROMPT.md` (requirements), this file, then `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `AGENTS.md`.
2. Run `git status`, `git log --oneline -10`, `git branch -a`; check whether PR #1 / the Phase 2 PR have merged.
3. Verify state: `npm install && npm run db:up && npm run db:migrate && npm run check && npm run build`.
4. Constraints: never commit `.env` or secrets; never force-push; never reset/drop the production DB; every endpoint follows the request pattern in §4 and uses `src/server/policies`; don't mark features verified without running checks; keep `messages/en.json` and `hi.json` keys in sync; update this file after each milestone.
5. **Next concrete action:** Phase 3 step 1: `src/lib/validation/hotel.ts` + `src/server/services/hotels.ts` (list with cursor pagination + search, get, create, update; Owner-only deactivate/assignCoordinator in a transaction with AuditLog), then `/[locale]/hotels` directory and `/[locale]/hotels/[id]` detail page, with integration tests.
