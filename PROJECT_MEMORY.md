# PROJECT_MEMORY.md — canonical AI / developer handover

_Last updated: 2026-10-18 (end of Phase 5), branch `feat/phase-5-live-tracking` (from `main` after PRs #1–#4 merged)._

Requirements: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) is the full, canonical project brief.

The repository's verified state takes precedence over this file. If they disagree, fix this file first.

---

## 1. Project Overview

- **Purpose:** Mobile-first, bilingual (English/Hindi) event management web app for hotels, hotel coordinators, buses and attendees, with coordinator-controlled live bus GPS tracking.
- **Account types (roles):** `OWNER` (everything incl. reassignment, roles, config), `ADMIN` (view/manage operational records, no Owner powers), `COORDINATOR` (their designated hotel + buses/trips they are assigned to; controls bus status and GPS sharing), `CUSTOMER` (attendee: own profile + own hotel, its coordinator and its buses only).
  - The brief lists three account types; `COORDINATOR` is a separate role so coordinators get least-privilege trip control instead of Admin rights. See `docs/ARCHITECTURE.md`.
- **Scale target:** 16,000+ registered users, 2,000+ concurrent. Not yet tested.
- **Stack:** Next.js 16.4 (App Router, TypeScript strict, Turbopack), Tailwind CSS 4, next-intl 4, Zod 4, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17, Vitest 4. OTP: Twilio Verify (REST, no SDK) behind `OtpProvider`. Maps: Google Maps JS API via `@vis.gl/react-google-maps` 1.10.1. Realtime: Pusher Channels (`pusher` 5.3.4 server, `pusher-js` 8.6.0 client) behind `RealtimePublisher`, with polling fallback. Planned: k6, Playwright.
- **Package manager:** npm (commit `package-lock.json`; don't mix managers). Node ≥ 22 (developed on Node 26).

## 2. Current Project Status

- **Stage:** Phase 5 (trips, status, live GPS, realtime) complete on `feat/phase-5-live-tracking`. Phase 6 not started.
- **Completed:** Phases 1–4; Phase 5: trips service (start/end/status/sharing/location), `POST /api/locations` with ordering + sampling + rate limit, `GET /api/buses/[id]/live`, `/api/realtime/auth`, Pusher publisher (disabled when not configured), coordinator homepage (start trip / open controls), coordinator trip screen (large status buttons, GPS sharing with throttling, heartbeat, retry, Wake Lock, permission errors, end trip), staff trip controls on the bus page (start for designated coordinator, correct status, end), live attendee views (homepage summaries + tracking page) via Pusher or 15 s polling, retention script `npm run ops:prune`.
- **Partially implemented:** Owner audit-log viewer and event-settings page not built (EventConfig editable only in DB).
- **Not started:** Phase 6 polish (translation audit, accessibility pass), Phase 7 (deployment, load tests, CSP, scheduled prune).
- **Broken/blocked:** nothing broken. **Unverified with real services/devices:** phone GPS on a real Android/iPhone, Pusher delivery, Google Maps, Twilio OTP (no accounts/devices tested yet).
- **PRs:** #1–#4 merged into `main`. Phase 5 PR not yet opened.

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
src/app/[locale]/hotels/        page (directory), new/, [id]/ (detail + edit + Owner actions)
src/app/[locale]/buses/         page, new/, [id]/ (detail, stops editor, edit, Owner reassignments)
src/app/[locale]/coordinators/  page (directory), [id]/ (PersonDetail, role must be COORDINATOR)
src/app/[locale]/people/        page (search + role/hotel/status filters), new/, [id]/ (PersonDetail)
src/app/[locale]/track/[id]/    Attendee-facing bus view (live status, freshness, map, stops); any role, policy-checked
src/app/[locale]/coordinator/trip/[id]/  Coordinator trip screen (TripControls); own active trip only
src/app/api/locations/          POST GPS reading (coordinator of active trip only)
src/app/api/buses/[id]/live/    GET live snapshot (polling fallback), canViewBus
src/app/api/realtime/auth/      Pusher private-channel auth, canViewBus
src/app/[locale]/not-found.tsx  Translated 404 (also used for forbidden records)
src/components/auth/            LoginForm, SignOutButton
src/components/layout/          LanguageSwitcher, StaffNav (Owner/Admin nav), StatTile, EventOverview
src/components/ui/              ActionForm (+ field-error context), Fields (TextField, SelectField), Layout (PageHeader, Section, Badge, ListCard, DetailList, MapsLink, EmptyState), Directory (SearchForm, FilterSelect, Pagination)
src/components/{hotels,buses,people}/  HotelFields, BusFields/StopFields, PersonDetail
src/components/maps/            LocationMap (dynamic, fallback when no key), LocationMapInner (APIProvider, AdvancedMarker+Pin)
src/components/transport/LiveBus.tsx  LiveBusSummary (homepage) + LiveBusDetail (tracking: status, freshness, map, mode)
src/components/trips/TripControls.tsx  Status buttons (statusVersion), GPS sharing panel, end trip
src/hooks/useGeolocationSharing.ts  watchPosition + heartbeat, throttle (10 s / 5 s & 25 m), retry backoff, Wake Lock, resume after reload
src/hooks/useBusLive.ts         Pusher subscription (lazy pusher-js) + polling (15 s, 60 s when live), newest-location merge
src/lib/realtime/types.ts       BusLiveSnapshot, busChannel/parseBusChannel, pusherPublic (client-safe)
src/lib/realtime/publisher.ts   RealtimePublisher (Pusher | disabled), setRealtimeForTests
src/features/trips/actions.ts   Trip Server Actions (direct calls for TripControls; form actions for staff)
src/features/run-action.ts      Shared `run()` wrapper for form Server Actions (moved out of admin/actions.ts)
src/server/services/trips.ts    startTrip, endTrip, changeStatus, setSharing, recordLocation, activeTripsFor
src/server/services/maintenance.ts  pruneOldData (retention)
scripts/prune.ts                npm run ops:prune
src/lib/maps/config.ts          mapsApiKey (placeholder "<…>" = unset), mapId (default DEMO_MAP_ID), MapPoint type
src/lib/transport/status.ts     STATUS_KIND, STATUS_ICON, locationFreshness(live/stale/none)
src/server/services/transport.ts  getEventSettings, getCustomerHome, getTrackedBus, toSnapshot, getBusSnapshot, assertCanViewBus, getLiveBus, publishBus
src/features/admin/             actions.ts (all form Server Actions), action-state.ts (ActionState type)
src/lib/validation/             common.ts (field schemas, formToObject, fieldErrors), entities.ts (hotel, bus, stop, person schemas)
src/lib/utils/page.ts           param(), requireStaff(), orNotFound()
src/server/errors.ts            AppError(code, reason), forbidden/notFound/conflict, isUniqueViolation
src/server/services/{hotels,buses,people}.ts  Business rules + policy checks + transactions + audit
src/server/services/audit.ts    audit(tx, actor, action, entityType, entityId, changes)
src/server/services/pagination.ts  PAGE_SIZE 25, pageArgs/toPage (keyset by id), OPTIONS_LIMIT 500
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
src/server/services/dashboard.ts  getEventOverview (staff), getCoordinatorOverview
tests/setup.ts                  Points DATABASE_URL at TEST_DATABASE_URL (name must contain test/ci) or a dead URL
tests/global-setup.ts           prisma migrate deploy on the test DB
tests/unit/                     env, phone, policies, transport, realtime
tests/integration/              auth, authorization, create-owner, admin-services, transport, trips, maintenance (+ helpers.ts)
AGENTS.md                       Next.js agent rules (auto-maintained block) + pointer to this file
```

Planned locations: Owner audit/settings pages → `src/app/[locale]/owner/{audit,settings}`; load tests → `tests/load/` (k6).

## 4. Architecture and Data Model

- Full details: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md` (has the permission matrix).
- **Entities:** User, Hotel, Bus, BusStop, Trip, BusLocation (latest per bus), LocationPoint (sampled history), BusStatusEvent, Session, RateLimitBucket, AuditLog, EventConfig (single row). No schema changes in Phase 2.
- **Request pattern (use for every new endpoint/page):** `getApiUser()`/`requireUser()` → `isSameOrigin()` for JSON mutations (Server Actions are origin-checked by Next) → Zod-parse input → `loadScope()` if non-staff → policy check (`can`/`canView*`) → service → `ok()`/`fail()` or `ActionState`.
- **Admin UI pattern:** see `docs/ARCHITECTURE.md` › Admin UI pattern. New forms: add a Server Action in `src/features/<area>/actions.ts` using `run()`, render with `<ActionForm>` + `<TextField>/<SelectField>`.
- **Phase 3 rules:** hotel coordinator is unique per hotel and per coordinator (assigning moves them); Admin may make an attendee's *first* hotel allotment, only Owner changes it (`canSetAttendeeHotel`); `bus.assignCoordinator` is Owner-only; deactivation guards (hotel in use, bus/coordinator on trip); role change away from COORDINATOR clears hotel/bus designations, away from CUSTOMER clears hotel; phone change or deactivation revokes sessions; stops are re-sequenced 1..n on remove/move.
- **Auth flow:** phone → `normalizePhone` → rate limits → active user lookup (unknown/inactive numbers: generic "sent", no SMS) → `OtpProvider.send` → code → `OtpProvider.check` → `createSession` (random token cookie, SHA-256 in DB) → audit `auth.login` → redirect to role home.
- **Sessions:** cookie `__Host-session` (prod) / `session` (dev), HttpOnly, SameSite=Lax, 365-day cookie; validity = DB `expiresAt` (30 days of inactivity, renewed ≤ once/day). User row re-read every request.
- **API envelope:** `{ok:true,data}` / `{ok:false,error:{code}}`, `Cache-Control: no-store`. Codes in `src/lib/api/response.ts`; client maps them to `auth.errors.*` strings.
- **Attendee views (Phase 4):** see `docs/ARCHITECTURE.md` › Attendee views. `getTrackedBus` returns 404 for buses outside scope or inactive (non-staff). Attendees see the trip coordinator's name + phone for their own buses. Stale locations (older than `EventConfig.staleLocationSeconds`, default 120 s) are labelled and drawn grey; never shown as current.
- **Trips/GPS/realtime (Phase 5):** see `docs/ARCHITECTURE.md` › Trips, status and GPS (diagram + rules). Key invariants: one active trip per bus and per coordinator; only newer `recordedAt` replaces `BusLocation`; `BusLocation` deleted on trip end; `statusVersion` optimistic concurrency; every change → `publishBus(snapshot)`; realtime failures never fail writes; viewers fall back to polling.

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
| CI workflow | Verified (Phases 1–4) | Phase 5 run pending |
| Attendee homepage + bus tracking page | Verified | 7 integration tests (`transport.test.ts`: own bus visible with trip/location/stops; other hotel's bus and unknown IDs → not_found; hotel reassignment immediate; inactive bus hidden from attendee, visible to admin; coordinator scope; inactive coordinator omitted; no-hotel case) + 3 unit tests (freshness, status grouping). Browser as attendee at 375px with a temporary demo trip (removed afterwards): status panel, stale-location warning, Hindi tracking page, other hotel's bus → translated 404 |
| Google Maps rendering | **Implemented, unverified** | No API key yet; the no-key fallback path was verified in the browser |
| Trips/status/GPS server logic | Verified | 11 integration tests (`trips.test.ts`): start permissions, one trip per bus/coordinator, staff start for designated coordinator, statusVersion conflicts, double-tap no-op, staff correction audited, GPS only from trip coordinator, out-of-order/duplicate ignored, future clock rejected, old ignored, history sampling, end trip clears live position and blocks updates, sharing permissions, live snapshot scoping |
| Retention cleanup | Verified | `maintenance.test.ts` + ran `npm run ops:prune` on dev DB |
| Coordinator trip screen + GPS hook | Verified with **simulated** GPS | Browser at 375px: start trip, status buttons (saved + highlighted), sharing with a geolocation shim (moving coordinates): 5 uploads/30 s while moving; permission-denied path shown on reload (pane blocks real geolocation); network loss during dev-server restart recovered |
| Live attendee updates (polling) | Verified | Browser tracking page updated position, status ("Reached bus stop") and trip end without reload; curl: other hotel's attendee 404 on live endpoint, 403 posting locations; realtime auth returns 503 when Pusher not configured |
| Real phone GPS (Android/iPhone) | **Unverified** | Needs a device test on HTTPS (geolocation requires a secure context; localhost is allowed) |
| Pusher live delivery | **Implemented, unverified** | No Pusher app yet |
| Hotel/bus/stop/person services + policies | Verified | 23 integration tests (`admin-services.test.ts`): CRUD, owner-only actions denied to admins, customers/coordinators denied, coordinator move, deactivation guards, duplicate phone/registration, stops ordering, pagination + search, session revocation |
| Admin UI (directories, detail pages, forms) | Verified (manual) | Browser as Owner at 375px: dashboard, hotels list, hotel detail, validation errors keep input + show field messages, successful save, add stop (form resets), Hindi people directory. curl: Admin sees edit/stop controls but no Owner-only buttons; Owner sees all; customer redirected from staff pages |

## 6. Outstanding Tasks (prioritized)

- [x] Phase 1 — Foundation
- [x] Phase 2 — Auth & authorization (Twilio live test pending)
- [x] Phase 3 — Core administration
  - [ ] Follow-ups: Owner audit-log viewer; event settings page (`config.update`: event name, stale threshold, retention, history sampling); collapsible filters on phones
- [x] Phase 4 — Customer experience (Maps live test pending)
- [x] Phase 5 — Trips, status and live GPS (real-device GPS + Pusher live tests pending)
- [ ] **Phase 6 — Bilingual UI and accessibility** (next)
  - [ ] Translation audit (all user-visible strings in en/hi; no hard-coded English like "—", seed demo names excluded)
  - [ ] Accessibility pass: headings order, focus management after actions, aria-live usage, contrast check, keyboard-only run of every flow
  - [ ] Mobile polish: collapsible filters, sticky primary actions on trip screen, tap targets audit
  - [ ] Owner audit-log page and event settings page (bilingual)
  - [ ] Verify all dashboards on phone + desktop widths
- [ ] Phase 7 — Deployment (Vercel + managed Postgres + Pusher + Twilio + Maps keys), DEPLOYMENT.md/OPERATIONS.md, scheduled `ops:prune`, k6 load tests, CSP header, real-device GPS test, production smoke test.

## 7. Current Development State

- **Last completed task:** Phase 5 (branch `feat/phase-5-live-tracking`).
- **In progress:** nothing.
- **Next recommended task:** Phase 6 (translation/accessibility/mobile polish + Owner audit/settings pages), or jump to Phase 7 deployment if real-world testing is more urgent.
- **Incomplete changes:** none. The local dev DB contains one ended demo trip on Bus 1 (with 9 history points) from browser testing; harmless, pruned after 7 days.
- **Check results (2026-10-18, local):** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 103/103 (12 files), `npm run build` ✅.

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
| GitHub `LiquifiedDoormat/event-management-platform` (public) | Connected. PRs #1–#4 merged into `main`. Pushes use `LiquifiedDoormat` via `gh auth setup-git`. Commits authored as `LiquifiedDoormat <324446387+LiquifiedDoormat@users.noreply.github.com>` (repo-local git config). |
| PostgreSQL | Local Docker only. Managed provider not chosen/created. |
| Phone OTP | `dev` provider locally. Twilio Verify implemented; **account not created, untested**. Env: `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Setup steps + pricing notes in README. |
| Realtime (Pusher Channels) | Integrated (`PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`); **no app yet, untested**. Without it the app polls every 15 s. Setup + cost notes in README › Live updates. |
| Google Maps Platform | Integrated (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`); **no key yet, untested with Google**. Setup, restrictions, billing and quota steps in README › Google Maps. |
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
- React 19 resets `<form action>` after every submit; `ActionForm` submits via `startTransition` instead so input survives validation errors. Don't switch it back to the `action` prop.
- Translation strings are visible in page payloads only for `common/auth/nav/forms/errors`; when debugging UI with grep, match rendered elements, not raw text.
- Directory search uses `contains` (ILIKE) without trigram indexes; fine for ~16k users, revisit under load testing.
- Dropdown option lists are capped at 500 (hotels/coordinators).
- npm 12 (local) blocks dependency install scripts by default (`npm install-scripts ls` lists prisma, esbuild, @swc/core, unrs-resolver, …). The app builds and runs without them; CI uses Node 22/npm 10, which runs them. Approve with `npm install-scripts approve <pkg>` only if something breaks.
- `.env` copied from `.env.example` contains `<…>` placeholders for Maps keys; `src/lib/maps/config.ts` treats those as unset.
- **Dev server reload loop:** running `next build` or `next typegen` (part of `npm run typecheck`/`check`) while `npm run dev` is running corrupted the dev cache once, causing endless page reloads. Fix: stop dev, `rm -rf .next`, restart. Prefer stopping the dev server before `npm run check`/`build`. Newly added nested API route folders may also need a dev-server restart.
- GPS sharing needs the coordinator page open and on screen (browser limitation); Wake Lock helps where supported (not on all iOS versions). Background tracking would need a native app.
- Geolocation requires HTTPS in production (secure context).
- Pusher-js is loaded lazily only when `NEXT_PUBLIC_PUSHER_KEY` is set.
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

- **2026-10-18 — Phase 3 core administration** (`feat/phase-3-admin`):
  - Added: `src/server/{errors.ts,services/{hotels,buses,people,audit,pagination}.ts}`, `src/lib/validation/{common,entities}.ts`, `src/lib/utils/page.ts`, `src/features/admin/{actions,action-state}.ts`, UI components (`ui/ActionForm`, `ui/Fields`, `ui/Layout`, `ui/Directory`, `layout/StaffNav`, `hotels/HotelFields`, `buses/BusFields`, `people/PersonDetail`), pages under `[locale]/{hotels,buses,coordinators,people}` (list, new, detail), `tests/integration/admin-services.test.ts`.
  - Changed: policies (`bus.assignCoordinator`, `canSetAttendeeHotel`), layout (StaffNav; only client-used message namespaces sent to browser), `i18n/request.ts` (timeZone Asia/Kolkata), StatTile/EventOverview (links), messages en/hi (+158 keys each, plural rules), docs (ARCHITECTURE admin UI pattern, SECURITY matrix), README.
  - No new dependencies. No schema changes.
  - Decisions: Server Actions for forms (built-in origin check); stops hard-deleted, everything else deactivated; Admin can do first attendee hotel allotment; bus coordinator assignment Owner-only; 25-row keyset pages; mobile bottom nav with hyphenated labels.

- **2026-10-18 — Phase 4 customer experience** (`feat/phase-4-customer`):
  - Added: `@vis.gl/react-google-maps@1.10.1`; `src/lib/{maps/config.ts,transport/status.ts}`, `src/server/services/transport.ts`, `src/components/maps/{LocationMap,LocationMapInner}.tsx`, `src/components/transport/{StatusParts,RefreshButton}.tsx`, `src/app/[locale]/track/[id]/page.tsx`, `src/app/[locale]/not-found.tsx`, tests `tests/unit/transport.test.ts`, `tests/integration/transport.test.ts`.
  - Changed: `[locale]/customer/page.tsx` (rebuilt, transport first), `[locale]/coordinator/page.tsx` (links to tracking), `[locale]/buses/[id]/page.tsx` ("See what attendees see"), `services/dashboard.ts` (removed `getCustomerOverview`, replaced by `getCustomerHome`), `tests/integration/authorization.test.ts`, messages en/hi (`transport`, `maps`, `errors.notFoundHelp`, `buses.attendeeView`), README (Google Maps section), ARCHITECTURE, SECURITY.
  - No schema changes.
  - Decisions: one tracking route for all roles (policy-checked); attendees see the on-board coordinator's phone; stale = grey marker + warning; no polylines between stops; maps loaded only client-side on map pages; no key → text fallback.

- **2026-10-18 — Phase 5 trips, status, live GPS** (`feat/phase-5-live-tracking`):
  - Added deps: `pusher@5.3.4`, `pusher-js@8.6.0`.
  - Added: `src/server/services/{trips,maintenance}.ts`, `src/lib/realtime/{types,publisher}.ts`, `src/hooks/{useGeolocationSharing,useBusLive}.ts`, `src/components/{trips/TripControls,transport/LiveBus}.tsx`, `src/features/{run-action.ts,trips/actions.ts}`, routes `api/locations`, `api/buses/[id]/live`, `api/realtime/auth`, page `[locale]/coordinator/trip/[id]`, `scripts/prune.ts` (`npm run ops:prune`), tests `tests/integration/{trips,maintenance}.test.ts`, `tests/unit/realtime.test.ts`.
  - Changed: `services/transport.ts` (snapshots, publish, assertCanViewBus; customer home loads full location), `services/buses.ts` (statusVersion), `lib/api/response.ts` (`failFromError`, new codes), `features/admin/actions.ts` (uses shared `run`), pages customer/track/coordinator/buses[id], layout (client namespaces + `busStatus`, `transport`, `trip`), messages en/hi (`trip.*`, transport live/polling, new error reasons; removed refresh strings), README (Live updates, Coordinator guide, Data retention), ARCHITECTURE, SECURITY.
  - Removed: `components/transport/{StatusParts,RefreshButton}.tsx` (replaced by live client components).
  - No schema changes.
  - Decisions: one snapshot publish per change; polling fallback 15 s (60 s safety when live); location send throttle 10 s / 5 s+25 m, 30 s heartbeat; stale threshold from EventConfig; trip end deletes live position; staff may start trips only for the bus's designated coordinator.

## 12. Instructions for the Next AI

1. Read `docs/MASTER_PROMPT.md` (requirements), this file, then `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATABASE.md`, `AGENTS.md`.
2. Run `git status`, `git log --oneline -10`, `git branch -a`; check whether the Phase 5 PR has merged.
3. Verify state: `npm install && npm run db:up && npm run db:migrate && npm run check && npm run build`.
4. Constraints: never commit `.env` or secrets; never force-push; never reset/drop the production DB; every endpoint follows the request pattern in §4 and uses `src/server/policies`; don't mark features verified without running checks; keep `messages/en.json` and `hi.json` keys in sync; update this file after each milestone.
5. **Next concrete action:** Phase 6 step 1: Owner audit-log page (`can(actor, "audit.view")`, paginated, filter by entity/actor) and event settings page (`config.update`: eventName, staleLocationSeconds, locationRetentionDays, historySampleSeconds with DB bounds), both en/hi, with tests; then the translation/accessibility audit.
