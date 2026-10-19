# PROJECT_MEMORY.md — canonical AI / developer handover

_Last updated: 2026-10-19 (end of Phase 8), branch `feat/phase-8-events-pin` (based on `feat/phase-7-deploy`, PR #7 open and unmerged)._

Requirements: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) is the full, canonical project brief.

The repository's verified state takes precedence over this file. If they disagree, fix this file first.

---

## 1. Project Overview

- **Purpose:** Mobile-first, bilingual (English/Hindi) event management web app for **multiple independent events**: hotels, hotel coordinators, buses and attendees, with coordinator-shared live bus GPS.
- **Zero-recurring-cost policy (Phase 8):** no SMS/OTP, realtime or map provider. Sign-in is built in (PIN / phone + event code); live updates poll the server; maps default to "Open in Google Maps" links. Remaining possible costs: hosting, database, optional domain (see DEPLOYMENT.md › Cost review).
- **Roles:** `OWNER` (everything, all events; only via CLI), `ADMIN` (manage operational records in any event; create/edit events; reset Coordinator PINs), `COORDINATOR` (their hotel/buses/trips in events they're registered for; attendee search), `CUSTOMER` (attendee; read-only; own hotel in the selected event).
- **Stack:** Next.js 16.4, TypeScript strict, Tailwind 4, next-intl 4, Zod 4, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17, Vitest 4. Optional Google Maps JS via `@vis.gl/react-google-maps`. **Removed in Phase 8:** Twilio (REST, no SDK), `pusher`, `pusher-js`.
- **Package manager:** npm. Node ≥ 22 (developed on Node 26).
- Full requirements: `docs/MASTER_PROMPT.md` (original brief, kept verbatim; Phase 8 instructions supersede its SMS-OTP/Pusher parts).

## 2. Current Project Status

- **Stage:** Phase 8 implemented and verified locally on `feat/phase-8-events-pin` (2 local commits, not pushed). Phase 7 tooling is in PR #7 (open, CI green, **not merged**). Production never deployed.
- **Completed (verified locally):** Phases 1–7; Phase 8: events + memberships + migration, PIN sign-in with setup codes/lockout, attendee phone+event(+code) sign-in, event isolation across all services, event create/edit/deactivate + server-checked switching, coordinator attendee search, PIN reset UI, Twilio/OTP/Pusher removal, polling live updates, tracking HTTPS/accuracy/signed-out states, docs + cost review.
- **Unverified:** real smartphone GPS; real laptop geolocation (browser pane blocks geolocation); Google Maps with a key; any deployment of Phases 7–8; k6 load test.
- **Blocked:** deployment needs owner accounts (Neon + Vercel env vars) — Twilio and Pusher are **no longer needed**.

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
src/proxy.ts                    Next 16 "proxy" (was middleware): next-intl locale routing + per-request CSP nonce. Not auth.
src/lib/auth/pin.ts             hashPin/verifyPin (scrypt), isWeakPin, newSetupCode/hashSetupCode
src/lib/api/auth-response.ts    Shared sign-in response (sets session cookie)
src/app/api/auth/{pin,setup-pin,attendee}/  Sign-in routes (replaced auth/otp/*)
src/server/services/{events,context}.ts  Events CRUD/switch; eventOf(actor) → session event or AppError("noEventSelected")
src/app/[locale]/events/, events/[id]/   Event list/create/edit/deactivate (staff)
src/app/[locale]/coordinator/people/     Coordinator attendee search
src/components/layout/EventSwitcher.tsx  Current event + switch (server action)
src/components/events/EventFields.tsx, src/features/events/actions.ts, src/features/admin/action-state.ts (secret display)
src/i18n/                       routing.ts, request.ts, navigation.ts (locale-aware Link/redirect/useRouter)
src/app/[locale]/layout.tsx     html/body, fonts, header (language switcher + sign-out when signed in)
src/app/[locale]/page.tsx       Redirects to role home or /login
src/app/[locale]/login/         Login page (server) → components/auth/LoginForm (client, 2 steps)
src/app/[locale]/{owner,admin,coordinator,customer}/page.tsx   Role homepages (requireUser with role list)
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
src/app/[locale]/not-found.tsx  Translated 404 (also used for forbidden records)
src/app/[locale]/{error,loading}.tsx  Translated error boundary (retry) and loading state
src/app/[locale]/owner/{audit,settings}/  Owner audit log + event settings
src/app/[locale]/profile/       Own details + preferred language
src/components/ui/BackLink.tsx  Back link with 44 px tap target
src/features/profile/actions.ts  updateLanguageAction (self only)
src/server/services/settings.ts  settingsInput, getSettings, updateSettings, listAuditLog (Owner only)
src/components/auth/            LoginForm, SignOutButton
src/components/layout/          LanguageSwitcher, StaffNav (Owner/Admin nav), StatTile, EventOverview
src/components/ui/              ActionForm (+ field-error context), Fields (TextField, SelectField), Layout (PageHeader, Section, Badge, ListCard, DetailList, MapsLink, EmptyState), Directory (SearchForm, FilterSelect, Pagination)
src/components/{hotels,buses,people}/  HotelFields, BusFields/StopFields, PersonDetail
src/components/maps/            LocationMap (dynamic, fallback when no key), LocationMapInner (APIProvider, AdvancedMarker+Pin)
src/components/transport/LiveBus.tsx  LiveBusSummary (homepage) + LiveBusDetail (tracking: status, freshness, map, mode)
src/components/trips/TripControls.tsx  Status buttons (statusVersion), GPS sharing panel, end trip
src/hooks/useGeolocationSharing.ts  watchPosition + heartbeat, throttle (10 s / 5 s & 25 m), retry backoff, Wake Lock, resume after reload
src/hooks/useBusLive.ts         Polling only: 20 s during a trip, 60 s idle, visible pages only; newest-location merge; offline state
src/lib/realtime/types.ts       BusLiveSnapshot (polled by viewers)
src/features/trips/actions.ts   Trip Server Actions (direct calls for TripControls; form actions for staff)
src/features/run-action.ts      Shared `run()` wrapper for form Server Actions (moved out of admin/actions.ts)
src/server/services/trips.ts    startTrip, endTrip, changeStatus, setSharing, recordLocation, activeTripsFor
src/server/services/maintenance.ts  pruneOldData (retention)
scripts/prune.ts                npm run ops:prune
scripts/vercel-build.mjs        Vercel build: prisma migrate deploy (production only / MIGRATE_ON_BUILD=1) + next build
scripts/loadtest-seed.ts        Load-test users/hotels/buses/trips + session tokens → tests/load/.tokens.json (git-ignored); --cleanup
src/app/api/cron/prune/         Vercel Cron target (Bearer CRON_SECRET)
tests/load/event-day.js         k6 scenarios: attendees (home, track, 15 s polling), gps (coordinators), staff (search)
vercel.json                     buildCommand, region bom1, cron 21:30 UTC daily
docs/DEPLOYMENT.md, docs/OPERATIONS.md  Deploy/runbook/load-test docs
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
src/config/env.ts               Zod env validation (APP_URL, DATABASE_URL)
src/lib/api/                    response.ts (JSON envelope + error codes), request.ts (isSameOrigin, clientIp, readJson)
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
tests/unit/                     env, phone, policies, transport, request, pin
tests/integration/              auth (PIN/attendee), authorization, create-owner, admin-services, transport, trips, maintenance, settings, events (isolation/switch/PIN reset/coordinator list/read-only) (+ helpers.ts: defaultEvent, createUser→actor, moveAttendee, staff)
AGENTS.md                       Next.js agent rules (auto-maintained block) + pointer to this file
```



## 4. Architecture and Data Model

- **Phase 8 model:** `Event` (name, dates, isActive, attendeeCodeHash) → `Hotel.eventId` (required) → buses/trips/locations via hotel. `EventMember(eventId,userId,hotelId?)` registers attendees/coordinators per event (attendee hotel lives here; `User.hotelId` removed). Staff (Owner/Admin) aren't members and can access every event. `Session.eventId` = selected event; `validateSession` re-checks membership + active event for non-staff on every request and returns `user.eventId/eventName/hotelId`. Every service scopes by `eventOf(actor)`; cross-event IDs behave as not found. `Hotel` unique `(eventId, coordinatorId)`. `EventConfig.eventName` removed (event name lives on Event).
- **Auth (Phase 8):** see SECURITY.md › Authentication. PIN = scrypt; setup code = SHA-256, 7 days, single use, issued via `issueSetupCode` (clears PIN, revokes sessions); lockout 5 → 15 min; rate limits 10/15 min per phone. Attendees: phone + event (+ event code). `canResetPin`: Owner→Admin/Coordinator, Admin→Coordinator; Owner via CLI `--reset-pin`.

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
| PIN sign-in, setup codes, lockout, rate limits | Verified | 9 integration tests (`auth.test.ts`) + 3 unit (`pin.test.ts`) + API checks on dev server (Phase 8) |
| Attendee sign-in (phone + event + optional code) | Verified | 5 integration tests + API checks (right/wrong event) |
| Event isolation, switching, event admin, PIN reset, coordinator search, attendee read-only | Verified | 12 integration tests (`events.test.ts`) + curl checks (cross-event URL → 404, coordinator list scoped) |
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
| CI workflow | Verified (Phases 1–6) | Phase 7 run pending |
| Attendee homepage + bus tracking page | Verified | 7 integration tests (`transport.test.ts`: own bus visible with trip/location/stops; other hotel's bus and unknown IDs → not_found; hotel reassignment immediate; inactive bus hidden from attendee, visible to admin; coordinator scope; inactive coordinator omitted; no-hotel case) + 3 unit tests (freshness, status grouping). Browser as attendee at 375px with a temporary demo trip (removed afterwards): status panel, stale-location warning, Hindi tracking page, other hotel's bus → translated 404 |
| Google Maps rendering | **Implemented, unverified** | No API key yet; the no-key fallback path was verified in the browser |
| Trips/status/GPS server logic | Verified | 11 integration tests (`trips.test.ts`): start permissions, one trip per bus/coordinator, staff start for designated coordinator, statusVersion conflicts, double-tap no-op, staff correction audited, GPS only from trip coordinator, out-of-order/duplicate ignored, future clock rejected, old ignored, history sampling, end trip clears live position and blocks updates, sharing permissions, live snapshot scoping |
| Retention cleanup | Verified | `maintenance.test.ts` + ran `npm run ops:prune` on dev DB |
| Coordinator trip screen + GPS hook | Verified with **simulated** GPS | Browser at 375px: start trip, status buttons (saved + highlighted), sharing with a geolocation shim (moving coordinates): 5 uploads/30 s while moving; permission-denied path shown on reload (pane blocks real geolocation); network loss during dev-server restart recovered |
| Live attendee updates (polling) | Verified | Browser tracking page updated position, status ("Reached bus stop") and trip end without reload; curl: other hotel's attendee 404 on live endpoint, 403 posting locations; realtime auth returns 503 when Pusher not configured |
| Real phone GPS (Android/iPhone) | **Unverified** | Needs a device test on HTTPS (geolocation requires a secure context; localhost is allowed) |
| Owner audit log + settings | Verified | 4 tests (`settings.test.ts`: bounds, owner-only, changed-fields audit, paging, entity filter, sign-ins hidden) + browser: invalid value shows field error and keeps input, valid save "Saved." |
| Profile language preference | Verified (manual) | Browser: saving Hindi redirects to `/hi/profile?saved=1` with confirmation; select is properly labelled |
| CSP + security headers | Verified (local) | curl: nonce on all 31 scripts; browser dev + local production build: no CSP violations, pages hydrate, language switch works. Not yet verified with live Maps/Pusher |
| Same-origin check on any host | Verified | 4 unit tests (`request.test.ts`) |
| Cron prune endpoint | Verified (local) | curl: 503 without secret, 401 wrong token, 200 runs prune |
| Load-test tooling | Seed verified; **k6 run not yet done** | Seed created 60 attendees/6 buses/tokens on test DB and cleaned up; refused a production-like DB name. k6 not installed locally; no staging yet |
| Accessibility/i18n polish | Verified (manual) | First Tab focuses translated skip link; language switch keeps `?role=…`; filters collapsed on phone, open with count when active; en/hi keys match (344 each); all 28 audit actions labelled |
| Hotel/bus/stop/person services + policies | Verified | 23 integration tests (`admin-services.test.ts`): CRUD, owner-only actions denied to admins, customers/coordinators denied, coordinator move, deactivation guards, duplicate phone/registration, stops ordering, pagination + search, session revocation |
| Admin UI (directories, detail pages, forms) | Verified (manual) | Browser as Owner at 375px: dashboard, hotels list, hotel detail, validation errors keep input + show field messages, successful save, add stop (form resets), Hindi people directory. curl: Admin sees edit/stop controls but no Owner-only buttons; Owner sees all; customer redirected from staff pages |

## 6. Outstanding Tasks (prioritized)

- [x] Phases 1–7 (Phase 7 in PR #7, unmerged)
- [x] Phase 8 — zero-cost auth, multi-event, coordinator search, location audit (local verification only)
- [ ] **Release** (next): review PR #7 + Phase 8 together; owner creates Neon DB + Vercel env vars (no Twilio/Pusher); merge combined changes; first production deploy (migrations run automatically); `owner:create` → setup code → PIN; create events; smoke test (DEPLOYMENT.md §5)
- [ ] Real-device GPS test (Android Chrome, iPhone Safari) + laptop fallback test on the HTTPS deployment
- [ ] Staging k6 run (OPERATIONS.md) and decide hosting plan vs. load (DEPLOYMENT.md › Cost review)
- [ ] Optional: per-attendee codes if impersonation risk is unacceptable; longer attendee poll interval if free-tier limits bite

## 7. Current Development State

- **Last completed task:** Phase 8 implementation, docs and checks.
- **In progress:** nothing (awaiting owner decision on PR strategy / push).
- **Next recommended task:** push `feat/phase-8-events-pin` and open a PR into `feat/phase-7-deploy` (stacked on PR #7) for review; then release per §6.
- **Check results (2026-10-19, local, dev server stopped):** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 118/118 (15 files), `npm run build` ✅, `npm run build` with **no env vars** ✅. Migration verified on empty DB, populated dev DB and test DB (no drift). API checks against dev server: attendee/PIN sign-in per event, wrong-event refusal, cross-event 404s, coordinator list scoping — all as expected.
- **CI:** PR #7 green; Phase 8 CI not yet run (branch not pushed).

## 8. Setup and Execution

```bash
npm install                      # also runs prisma generate
cp .env.example .env             # set POSTGRES_PASSWORD and the same password in DATABASE_URL + TEST_DATABASE_URL
npm run db:up                    # Docker Postgres 17 on :5432 (creates event_dev + event_test)
npm run db:migrate               # apply migrations to dev DB
npm run db:seed                  # optional local demo data
npm run owner:create -- --phone "<mobile>" --name "<name>"   # first Owner
npm run dev                      # http://localhost:3000 ; sign in with the demo table in README (demo PIN 246810)
npm run check                    # lint + typecheck + all tests (integration tests need TEST_DATABASE_URL)
npm run build                    # production build
```

Local demo accounts after seeding (fake numbers): admin `9999900002`; coordinators `9999900010`, `9999900011`; attendees `9999900100–104`, `9999900110–114`. The developer's local dev DB also has a Demo Owner `9999900001` (created with the script, not by the seed).

## 9. Environment and External Services

| Service | Status |
| --- | --- |
| GitHub `LiquifiedDoormat/event-management-platform` (public) | Connected. PRs #1–#6 merged into `main`. Pushes use `LiquifiedDoormat` via `gh auth setup-git`. Commits authored as `LiquifiedDoormat <324446387+LiquifiedDoormat@users.noreply.github.com>` (repo-local git config). |
| PostgreSQL | Local Docker only. Managed provider not chosen/created. |
| Phone OTP | **Removed** (Phase 8). Sign-in is built in; no provider. |
| Realtime | **Removed Pusher** (Phase 8). Viewers poll `/api/buses/[id]/live`. |
| Google Maps Platform | Optional (off by default; links only). Integrated (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`); **no key yet, untested with Google**. Setup, restrictions, billing and quota steps in README › Google Maps. |
| Vercel | Not set up. |

## 10. Known Issues and Risks

- **Residual security risks (accepted, see SECURITY.md):** 6-digit PIN strength (mitigated by lockout/rate limits/weak-PIN rejection); attendee impersonation by phone number (+ event code if set) — read-only, own-hotel data only; setup codes must be handed over privately.
- **Cost assumptions unverified:** Vercel Hobby non-commercial terms and invocation limits; Neon free compute; polling load at 2,000 viewers likely exceeds free tiers (DEPLOYMENT.md › Cost review). Not measured (no staging/k6 yet).
- **Release hazard:** merging PR #7 (Phase 7) to `main` **without** Phase 8 would deploy code that still requires Twilio for sign-in. Release Phase 7 and 8 together.
- **Location audit:** server ingest/validation/ordering/event scoping verified by tests; client flow verified with a simulated GPS shim (Phase 5) and the permission-denied path; HTTPS check, >100 m accuracy warning and signed-out handling added but **not exercised on real hardware**. Background tracking on mobile browsers is not reliable (documented).

- Prisma's npm `latest` tag points to `8.0.0-rc.23`; we pin stable **7.10.1** deliberately.
- Next.js 16 differs from older versions (`proxy.ts`, `PageProps`/`LayoutProps` from `next typegen`, async `cookies()`). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `cacheComponents` is off; all role pages are dynamic (they read cookies).
- `next build` runs with `NODE_ENV=production`; never read env at import time (see `src/lib/db/prisma.ts`).
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
- `upgrade-insecure-requests` is only sent in production. Local `next start` over HTTP still worked in Chrome (localhost is treated as secure).
- **Vercel is connected to the repo** (project `event-management-platform`, team `tgrj`); it builds a preview for each PR. The first preview (PR #6) failed because `prisma.config.ts` used prisma's `env("DATABASE_URL")`, which throws during `npm install` → `prisma generate` when the variable is unset. Fixed by reading `process.env.DATABASE_URL ?? ""`; install and `next build` now succeed with no env vars. Deployed pages still need the env vars (Phase 7) — and `OTP_PROVIDER=dev` is refused in production builds, so previews need Twilio (or a preview-only plan) before anyone can sign in.
- After editing a `"use server"` file, the running dev server once served a stale module (an action was `undefined` → page error). Restarting the dev server with a clean `.next` fixed it.
- Protected pages now return HTTP 200 with an in-page redirect when signed out (because of `loading.tsx` streaming); no data is leaked (see SECURITY.md). Tests/tools should not expect a 307 for pages.
- GPS sharing needs the coordinator page open and on screen (browser limitation); Wake Lock helps where supported (not on all iOS versions). Background tracking would need a native app.
- Geolocation requires HTTPS in production (secure context).
- Load/scale targets unverified (no staging k6 run yet).

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

- **2026-10-19 — Phase 6 bilingual UI, accessibility, polish** (`feat/phase-6-polish`):
  - Added: `src/server/services/settings.ts`, pages `[locale]/owner/{audit,settings}`, `[locale]/profile`, `[locale]/{error,loading}.tsx`, `src/components/ui/BackLink.tsx`, `src/features/profile/actions.ts`, `tests/integration/settings.test.ts`.
  - Changed: layout (skip link, `<main id="main">`, profile link, LanguageSwitcher in Suspense), `LanguageSwitcher` (keeps query; `LanguageSwitcherWithQuery`), `Directory.SearchForm` (collapsible filters, `activeFilters`), directory pages (filter counts), owner home (tool links), back links → `BackLink`, `admin/actions.ts` (`updateSettingsAction`), OTP verify returns `locale` and LoginForm navigates in it, messages en/hi (`settings`, `audit`, `profile`, error/loading/skip strings; soft hyphen in en `nav.coordinators`), README, SECURITY, ARCHITECTURE.
  - No schema changes, no new dependencies.

- **2026-10-19 — Phase 7 deployment tooling** (`feat/phase-7-deploy`):
  - Added: `vercel.json`, `scripts/{vercel-build.mjs,loadtest-seed.ts}`, `src/app/api/cron/prune/route.ts`, `tests/load/event-day.js`, `tests/unit/request.test.ts`, `docs/{DEPLOYMENT,OPERATIONS}.md`.
  - Changed: `src/proxy.ts` (CSP nonce + request-header override merge), `src/lib/api/request.ts` (`isSameOrigin` accepts own host), `prisma.config.ts` (`DIRECT_DATABASE_URL`), `.env.example` (`CRON_SECRET`, `DIRECT_DATABASE_URL`), `.gitignore` (load-test tokens), `package.json` (`vercel-build`), README, SECURITY.
  - No schema changes, no new dependencies.

- **2026-10-19 — Phase 8 zero-cost auth, events, coordinator search, location audit** (`feat/phase-8-events-pin`, commits 4327f8f + docs commit):
  - Migration `20261019060000_events_membership_pin` (hand-ordered backfill; see DATABASE.md).
  - Added: `src/lib/auth/pin.ts`, `src/lib/api/auth-response.ts`, routes `api/auth/{pin,setup-pin,attendee}`, `src/server/services/{events,context}.ts`, pages `[locale]/events`, `[locale]/events/[id]`, `[locale]/coordinator/people`, `components/{layout/EventSwitcher,events/EventFields}.tsx`, `features/events/actions.ts`, tests `tests/integration/events.test.ts`, `tests/unit/pin.test.ts`.
  - Rewritten: `services/{auth,people}.ts`, `components/auth/LoginForm.tsx`, `hooks/useBusLive.ts` (polling only), `prisma/seed.ts` (two events, demo PIN 246810), `tests/integration/{auth,helpers}.ts`, README, `.env.example`.
  - Changed: session (event context), policies (`canResetPin`, event actions), scope/hotels/buses/transport/trips/dashboard/settings (event scoping), create-owner (setup code, `--reset-pin`), loadtest-seed, TripControls/useGeolocationSharing (HTTPS, accuracy, signed-out), CSP (no Pusher), CI env, SECURITY/ARCHITECTURE/DATABASE/DEPLOYMENT/OPERATIONS.
  - Removed: `src/lib/auth/otp/*`, `api/auth/otp/*`, `src/lib/realtime/publisher.ts`, `api/realtime/auth`, `tests/unit/realtime.test.ts`, deps `pusher`, `pusher-js`; env `OTP_PROVIDER`, `TWILIO_*`, `PUSHER_*`.

## 12. Instructions for the Next AI

1. Read this file, `docs/SECURITY.md` (auth model + residual risks), `docs/DEPLOYMENT.md` (incl. cost review), then `docs/MASTER_PROMPT.md` (original brief; Phase 8 replaced its SMS-OTP and Pusher parts).
2. `git status`, `git log --oneline -10`, `git branch -a`, `gh pr list` — check PR #7 and whether a Phase 8 PR exists/merged.
3. Verify: `npm install && npm run db:up && npm run db:migrate && npm run db:seed && npm run check && npm run build` (stop the dev server first). Sign in locally with the demo table in README.
4. Constraints: no paid providers without owner approval; never commit `.env`/secrets/setup codes; never force-push; never reset/drop production; every query scoped with `eventOf(actor)`; attendees read-only; don't merge or deploy without explicit owner authorization; release Phase 7 + 8 together.
5. **Next concrete action:** with owner approval, push `feat/phase-8-events-pin`, open a PR into `feat/phase-7-deploy`, let CI run, then follow the release checklist in §6.
