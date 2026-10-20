# PROJECT_MEMORY.md — canonical AI / developer handover

_Last updated: 2026-10-20, branch `fix/owner-setup-clarity` (PRs #7 and #8 merged into `main`). Added bulk import (hotels/coordinators/attendees/buses) and fixed the embedded live-map re-centering gap — see §11._

Requirements: [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) is the full, canonical project brief.

The repository's verified state takes precedence over this file. If they disagree, fix this file first.

---

## 1. Project Overview

- **Purpose:** Mobile-first, bilingual (English/Hindi) event management web app for **multiple independent events**: hotels, hotel coordinators, buses and attendees, with coordinator-shared live bus GPS.
- **Zero-recurring-cost policy (Phase 8):** no SMS/OTP, realtime or map provider. Sign-in is built in (PIN for staff / phone number + event for attendees); live updates poll the server; maps default to "Open in Google Maps" links. Remaining possible costs: hosting, database, optional domain (see DEPLOYMENT.md › Cost review).
- **Roles:** `OWNER` (everything, all events; only via CLI), `ADMIN` (manage operational records in any event; create/edit events; reset Coordinator PINs), `COORDINATOR` (their hotel/buses/trips in events they're registered for; attendee search), `CUSTOMER` (attendee; read-only; own hotel in the selected event).
- **Stack:** Next.js 16.4, TypeScript strict, Tailwind 4, next-intl 4, Zod 4, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17, Vitest 4. Optional Google Maps JS via `@vis.gl/react-google-maps`. Bulk import (new) reads `.xlsx` via `exceljs`; `.csv` uses a small hand-written parser (no library) — the popular `xlsx`/SheetJS package was deliberately avoided (unfixed high-severity ReDoS/prototype-pollution advisories, directly reachable parsing untrusted uploads). **Removed in Phase 8:** Twilio (REST, no SDK), `pusher`, `pusher-js`.
- **Package manager:** npm. Node ≥ 22 (developed on Node 26).
- Full requirements: `docs/MASTER_PROMPT.md` (original brief, kept verbatim; Phase 8 instructions supersede its SMS-OTP/Pusher parts).

## 2. Current Project Status

- **Stage:** Phase 8 implemented and verified locally on `feat/phase-8-events-pin` (2 local commits, not pushed). Phase 7 tooling is in PR #7 (open, CI green, **not merged**). Production never deployed.
- **Completed (verified locally):** Phases 1–7; Phase 8: events + memberships + migration, PIN sign-in (first PIN chosen at sign-in)/lockout, attendee phone+event sign-in, event isolation across all services, event create/edit/deactivate + server-checked switching, coordinator attendee search, PIN reset UI, Twilio/OTP/Pusher removal, polling live updates, tracking HTTPS/accuracy/signed-out states, docs + cost review.
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
src/app/[locale]/import/        Bulk-import page (Owner/Admin): entity picker, upload, preview, confirm
src/app/api/import/template/    GET sample .csv per entity (staff only; Coordinators template Owner only)
src/lib/import/{entities,parse,errors,limits}.ts  Column config/templates, file parsing (csv hand-rolled + exceljs for .xlsx), ImportError, row/size caps
src/server/services/import.ts   previewImport (read-only) / commitImport (writes); reuses createHotel/createBus/createPerson per row
src/features/import/{actions,action-state}.ts  previewImportAction/commitImportAction (both re-parse the file from scratch; nothing trusted crosses the client)
src/components/import/ImportForm.tsx  Entity select, file input, preview table, commit report (client; calls the actions directly, not via <form action>)
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

- **Phase 8 model:** `Event` (name, dates, isActive) → `Hotel.eventId` (required) → buses/trips/locations via hotel. `EventMember(eventId,userId,hotelId?)` registers attendees/coordinators per event (attendee hotel lives here; `User.hotelId` removed). Staff (Owner/Admin) aren't members and can access every event. `Session.eventId` = selected event; `validateSession` re-checks membership + active event for non-staff on every request and returns `user.eventId/eventName/hotelId`. Every service scopes by `eventOf(actor)`; cross-event IDs behave as not found. `Hotel` unique `(eventId, coordinatorId)`. `EventConfig.eventName` removed (event name lives on Event).
- **Auth (Phase 8):** see SECURITY.md › Authentication. PIN = scrypt; staff flow: `pinStatus` (phone → `enter_pin`/`needs_pin`, POST /api/auth/pin-status) then `loginWithPin` or `setupPin` (only when `pinHash` is null; owner decision 2026-10-19: no setup codes, migration `20261019080000_drop_pin_setup_code`); reset = `clearPin` (clears PIN/lockout, revokes sessions); lockout 5 → 15 min; rate limits 10/15 min per phone. Attendees: phone + event only (owner decision 2026-10-19: no event code). `canResetPin`: Owner→Admin/Coordinator, Admin→Coordinator; Owner via CLI `--reset-pin`.

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
| PIN sign-in, first-PIN choice, resets, lockout, rate limits | Verified | 10 integration tests (`auth.test.ts`) + 2 unit (`pin.test.ts`) + API checks on dev server (Phase 8) |
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
| Google Maps rendering (embedded, live bus marker) | **Implemented; fallback/state logic verified, real embedded render still unverified** | 8 unit tests (`live-map.test.ts`: marker-merge/stale-vs-newer-location logic, initial-camera centering/bounds math; `maps-config.test.ts`: missing/placeholder/real key and Map ID handling). Browser as attendee (`/track/[busId]`, no key configured — still the only key available in this environment): GPS-not-yet-available, live, stale and ended-trip states all render correctly with the map's "not available" fallback + Google Maps link, exactly as designed; cross-event bus id still 404s. **No API key was available to test the actual embedded map render** — a key pasted into a chat message was deliberately not used (never put a credential that arrived over chat into `.env`/Vercel without the owner rotating/restricting it first) |
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
| Bulk import (hotels/coordinators/attendees/buses, .csv/.xlsx) | Verified | 26 tests (`import-parse.test.ts` unit: csv/xlsx parsing, size/row caps, malformed/empty files; `import.test.ts` integration: valid imports, invalid rows alongside valid ones, intra-file + DB duplicates, missing columns, cross-event hotel-name isolation, Admin denied Coordinators, unauthorized actor denied, no partial writes). Browser as Admin (en + hi): page renders, entity list excludes Coordinators for Admin, template download 200s, translations render. File-picker → preview → commit was **not** screenshot-verified (the browser tool can't drive the native file-choose dialog); the identical code path (`parseSpreadsheet` on a real `File`, then `previewImport`/`commitImport`) is exercised by the automated tests instead |

## 6. Outstanding Tasks (prioritized)

- [x] Phases 1–7 (Phase 7 in PR #7, unmerged)
- [x] Phase 8 — zero-cost auth, multi-event, coordinator search, location audit (local verification only)
- [ ] **Release** (next): review PR #7 + Phase 8 together; owner creates Neon DB + Vercel env vars (no Twilio/Pusher); merge combined changes; first production deploy (migrations run automatically); `owner:create` → sign in at once and choose PIN; create events; smoke test (DEPLOYMENT.md §5)
- [ ] Real-device GPS test (Android Chrome, iPhone Safari) + laptop fallback test on the HTTPS deployment
- [ ] Staging k6 run (OPERATIONS.md) and decide hosting plan vs. load (DEPLOYMENT.md › Cost review)
- [ ] Optional: longer attendee poll interval if free-tier limits bite

## 7. Current Development State

- **Last completed task:** Fixed the embedded live-map re-centering gap on the attendee tracking page and documented Google Maps setup end-to-end. Bulk import (hotels/coordinators/attendees/buses) before that. See §11.
- **In progress:** Work done directly on `fix/owner-setup-clarity` (no new branch/PR opened this session — not asked to). Not merged to `main`, not deployed.
- **Next recommended task:** owner reviews this diff and opens a PR; separately, owner should set up a real `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`/`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (README § Google Maps setup) and do one real manual check of the embedded map render, which no AI session has done yet (no key has ever been available in this environment).
- **Check results (2026-10-20, local, dev server left running on :3000 by the developer):** `npm run lint` ✅, `npm run typecheck` ✅, `npm test` ✅ 156/156 (19 files, +13 from this task on top of the bulk-import total), `npm run build` ✅. Browser-checked as the demo attendee (`9999900100`), no Maps key configured: GPS-not-yet-available/live/stale/ended-trip states and the map fallback all correct (temporary trip/location rows added then removed from the **dev** DB — never the test DB, never production). `npm audit`: `exceljs@4.4.0` pulls a moderate `uuid` advisory that does not apply here (see §11); unchanged this task.
- **CI:** not run this session (no PR opened).
- **A Google Maps API key was pasted directly into this session's task prompt.** It was not used, not written to any file, and not committed — rotate/restrict it in Google Cloud Console since it's now been exposed in chat, then set up a proper one via README § Google Maps setup.

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

- **Residual security risks (accepted, see SECURITY.md):** 6-digit PIN strength (mitigated by lockout/rate limits/weak-PIN rejection); attendee impersonation by phone number + event (owner accepted; no event code) — read-only, own-hotel data only; accounts without a PIN (new or reset) can be claimed by anyone knowing the number until the person sets it (owner accepted 2026-10-19; mitigated by prompt setup, PIN status in People, `auth.pinSet` audit).
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
  - Changed: session (event context), policies (`canResetPin`, event actions), scope/hotels/buses/transport/trips/dashboard/settings (event scoping), create-owner (`--reset-pin` clears the PIN), loadtest-seed, TripControls/useGeolocationSharing (HTTPS, accuracy, signed-out), CSP (no Pusher), CI env, SECURITY/ARCHITECTURE/DATABASE/DEPLOYMENT/OPERATIONS.
  - Removed: `src/lib/auth/otp/*`, `api/auth/otp/*`, `src/lib/realtime/publisher.ts`, `api/realtime/auth`, `tests/unit/realtime.test.ts`, deps `pusher`, `pusher-js`; env `OTP_PROVIDER`, `TWILIO_*`, `PUSHER_*`.

- **2026-10-19 — Attendee event code removed** (owner request): dropped `Event.attendeeCodeHash` (new migration `20261019070000_drop_event_attendee_code`), the login field, event form fields, service logic, tests and docs. Attendees sign in with phone number + event only.

- **2026-10-19 — Phone-first staff sign-in, setup codes removed** (owner request: "just ask for their phone number, check if they have set a password or not; if no then ask to set a password"):
  - Migration `20261019080000_drop_pin_setup_code` drops `User.pinSetupCodeHash`/`pinSetupExpiresAt`.
  - Added `pinStatus` + route `POST /api/auth/pin-status` (`enter_pin`/`needs_pin`; attendees/unknown numbers answer `enter_pin`). `setupPin` no longer takes a code; it works only while `pinHash` is null (conditional update), audit `auth.pinSet`.
  - Reset PIN (`clearPin`) clears PIN + lockout + sessions; no code shown. Removed secret plumbing from `ActionForm`/`run-action`/`action-state`; `create-owner` prints sign-in instructions only.
  - LoginForm staff tab: phone → Continue → PIN, or choose PIN twice; "Use a different number". Strings updated EN/HI; `pin` client namespace removed.
  - Accepted risk documented in SECURITY.md (unclaimed accounts).

- **2026-10-20 — Bulk import (hotels, coordinators, attendees, buses)**: manual creation/editing/assignment for all four entities already existed (Phase 3, unchanged) — this adds `.csv`/`.xlsx` bulk import alongside it. No schema changes.
  - Added: `src/lib/import/{entities,parse,errors,limits}.ts`, `src/server/services/import.ts` (`previewImport`/`commitImport`), `src/features/import/{actions,action-state}.ts`, `src/components/import/ImportForm.tsx`, `src/app/[locale]/import/page.tsx`, `src/app/api/import/template/route.ts`, `tests/unit/import-parse.test.ts`, `tests/integration/import.test.ts` (26 new tests), README § "Managing hotels, coordinators, attendees and buses".
  - Changed: `next.config.ts` (`experimental.serverActions.bodySizeLimit: "5mb"`, default 1 MB is too small for a spreadsheet), `src/components/layout/StaffNav.tsx` (Import nav item, `grid-cols-5`→`6`), `src/app/[locale]/layout.tsx` (`CLIENT_NAMESPACES` +`"import"` — translations silently render as raw keys for any client component whose namespace isn't added here, easy to miss), `messages/en.json`/`hi.json` (+`import.*`, `nav.import`; still 451 leaf keys matching in both files), `package.json` (+`exceljs@4.4.0`).
  - Dependency decision: `exceljs` for `.xlsx`, not the more common `xlsx`/SheetJS package — SheetJS's npm releases have **unfixed** high-severity ReDoS and prototype-pollution advisories (`npm audit`: "No fix available") that are directly reachable when parsing a file an admin uploads. `.csv` is parsed by a ~40-line hand-written, non-regex, single-pass parser instead of a library, for the same reason. `exceljs` itself pulls a *moderate* `uuid` advisory (unvalidated caller-supplied buffer in `v3/v5/v6`); confirmed by grep that exceljs only calls `uuid.v4()` with no buffer, so it doesn't apply to this usage — documented in README/PROJECT_MEMORY rather than silently ignored.
  - Design decisions (all in `docs/` nowhere yet — only here and in code comments): (1) **Preview then commit, no server-side pending state.** Both steps re-parse and re-validate the same uploaded file from scratch — the client never sends back anything it received from the preview step. This avoids needing a database table (or risky in-memory state — this app deploys as stateless serverless functions) to bridge the two requests, at the cost of asking the admin to keep the file selected in the browser between "Preview" and "Import" (the file input isn't cleared, so this works without a reselect). (2) **Row-level transactions, not one batch transaction.** Each valid row is written through the *existing* `createHotel`/`createBus`/`createPerson` service (each already wraps itself in its own `prisma.$transaction`), one row at a time, in file order. A failure on one row can't corrupt another row, but the batch as a whole is not atomic — this is intentional: the spec explicitly wants duplicates skipped and other rows still imported, which is incompatible with all-or-nothing. (3) **Permissions exactly mirror the manual forms** (`can(actor,"hotel.create")`/`"bus.create"`, `assignableRoles(actor)` for people) — so, as with the manual **People** page, only the Owner can import Coordinators (Admin is limited to Attendees); the Import page's entity dropdown hides Coordinators from Admins, and the service re-checks regardless. (4) **Duplicate matching rules** (no schema change, so these are judgment calls, written up in README): hotels by exact case-insensitive name per event; buses by registration (DB-unique) if given, else by (hotel, label); people by phone (DB-unique **globally**, not per event, matching the existing schema) — already-a-member-of-this-event is a skipped duplicate, member-of-a-different-event is a success ("added to this event"), same phone with a different existing role is a **reported failure**, never a silent skip.
  - Found and fixed two bugs via a live browser check that the automated test suite could not have caught: (a) a `"use server"` file may only export async functions — the original `actions.ts` also exported a plain `importIdle` constant, which Next.js turns into an unusable "server reference" and crashes any client code that reads it (`useState(importIdle)`) during render ("Server Functions cannot be called during initial render"). Fixed by moving the state type and the `idle` constant into a separate plain file, `action-state.ts`, exactly mirroring the pre-existing `src/features/admin/action-state.ts` pattern. (b) a new page's translation namespace must be added to `CLIENT_NAMESPACES` in `[locale]/layout.tsx` or every `useTranslations()` call in its client components renders the raw key instead of translated text, with no error — only visible by actually loading the page.
  - **Not verified in the browser:** the literal "choose a file → Preview → Import" click-through. The in-session browser tool cannot drive the OS native file-picker dialog or script a `<input type=file>` element (tried; browsers refuse to set `.value` on file inputs from JS, by design). The exact same code path (`parseSpreadsheet` given a real `File`, then `previewImport`/`commitImport`) is covered by the automated tests instead, which is as close as this environment gets without a real file-choose dialog.

- **2026-10-20 — Embedded Google Maps live bus tracker (attendee view)**: the embedded map itself (`LocationMap`/`LocationMapInner` using `@vis.gl/react-google-maps`), the polling hook (`useBusLive`), and the wiring into `/track/[busId]` and the customer homepage **already existed** (Phase 4/5) and already covered almost every requirement (real interactive map not an iframe, graceful missing-key fallback, marker from live data only — never a fake position, authorization/event isolation untouched, Maps-link fallback). This pass found and fixed one real gap, added test coverage, and wrote up the setup steps that were previously only "needs a key" in one sentence.
  - **Bug fixed — map never recentered on the bus's first GPS fix:** `<Map defaultCenter=.../defaultBounds=...>` applies those props **once**, at map creation (confirmed in `@vis.gl/react-google-maps`'s own source comment, not just inference). If an attendee opened the tracking page before the coordinator's phone sent its first location, the map would stay centered on the hotel/stops forever — polling only moved the marker *if* it was already on the initial screen, never panned to it. Fixed in `src/components/maps/LocationMapInner.tsx` with `useRecenterOnFirstFix`: a `useMap()` + `useEffect` that calls `map.fitBounds`/`map.setCenter` exactly once, the first time the bus's point id appears — then never again, so later polls only move the marker and don't fight the viewer's own pan/zoom. `view()` (initial camera) was also exported for testing.
  - Added: `tests/unit/live-map.test.ts` (8 tests — `merge()` from `useBusLive.ts`, now exported, covering newer-wins/stale-ignored/cross-trip/trip-ended marker logic; `view()` initial centering/bounds math), `tests/unit/maps-config.test.ts` (6 tests — `mapsApiKey`/`mapId` for unset, `.env.example`-placeholder and real values, via `vi.resetModules()` + `vi.stubEnv` per case).
  - Changed: `src/hooks/useBusLive.ts` (exported `merge`, no behavior change), README (new "Google Maps setup (optional)" subsection: exact Google Cloud Console steps — enable Maps JavaScript API + billing, create/restrict an API key by HTTP referrer, create a vector-rendering Map ID for Advanced Markers — and the Vercel env var steps), `docs/DEPLOYMENT.md` (env var table row points at the new README section).
  - Verified in the browser as the demo attendee (`9999900100`, no Maps key configured — see below) by hand-editing a temporary trip/location row in the **dev** DB and deleting it afterward (same approach as the Phase 4 note already in this file): GPS-not-yet-available, live, stale (backdated >120 s) and ended-trip states all render exactly as designed, the map's "not available" fallback + correct Google Maps link (bus vs. last-known-location wording) show in each case, and a different event's bus id still 404s (cross-event isolation intact). Noticed a **pre-existing, unrelated** hydration warning in `FreshnessNote`/`useNow` (`src/components/transport/LiveBus.tsx`, untouched by this change) — relative-time text ticks between server and client render by one second; cosmetic, self-corrects, out of scope to fix here.
  - **Not verified: the actual embedded map render with a real Google Maps API key.** None was available in this session — a key was pasted directly into the task prompt, and it was deliberately **not** used or committed (never put a credential that arrived over chat into `.env`/Vercel without the owner rotating/restricting it first; told the owner to do that). `npm run build`/`lint`/`typecheck`/`test` (156/156) all pass with the real `@vis.gl/react-google-maps` code path compiled in, but no one has loaded the map with billing enabled.
  - No schema changes, no new dependencies.

## 12. Instructions for the Next AI

1. Read this file, `docs/SECURITY.md` (auth model + residual risks), `docs/DEPLOYMENT.md` (incl. cost review), then `docs/MASTER_PROMPT.md` (original brief; Phase 8 replaced its SMS-OTP and Pusher parts).
2. `git status`, `git log --oneline -10`, `git branch -a`, `gh pr list` — PRs #7 and #8 are already merged to `main`; check what branch/PR (if any) holds the bulk-import work described in §11's 2026-10-20 entry before redoing it.
3. Verify: `npm install && npm run db:up && npm run db:migrate && npm run db:seed && npm run check && npm run build` (stop the dev server first). Sign in locally with the demo table in README.
4. Constraints: no paid providers without owner approval; never commit `.env`/secrets/PINs; never force-push; never reset/drop production; every query scoped with `eventOf(actor)`; attendees read-only; don't merge or deploy without explicit owner authorization.
5. If touching bulk import again: adding a new client-facing message namespace needs an entry in `CLIENT_NAMESPACES` (`src/app/[locale]/layout.tsx`) or translations silently render as raw keys; a `"use server"` file may only export async functions (put any shared constants/types in a plain sibling file, e.g. `action-state.ts`) — both bugs are easy to reintroduce and only show up by loading the page, not in `npm run check`.
6. **Next concrete action:** owner reviews the bulk-import diff on `fix/owner-setup-clarity`; open a PR if not already done; verify the file-picker → preview → commit flow by hand in a real browser (this wasn't possible from the agent's browser tool — see §11).
