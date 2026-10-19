# Architecture

## Overview

A single Next.js (App Router) application deployed on Vercel, backed by managed PostgreSQL and a managed realtime service. No microservices.

```
Phone browser ──HTTPS──► Next.js (Vercel, stateless)
                           ├─ pages / server components (UI, per-role dashboards)
                           ├─ route handlers + server actions (validated with Zod)
                           │     └─ services → policies (authorization) → Prisma
                           ├─► PostgreSQL (managed; pooled connections)
```

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Routing / UI | `src/app/[locale]/…`, `src/components/` | Presentation only. Never the place where permissions are enforced. |
| HTTP entry points | `src/app/api/…` (JSON, used by login), `src/features/*/actions.ts` (Server Actions, used by forms) | Parse + validate input (Zod), call a service, map result to a response / `ActionState`. |
| Services | `src/server/services/` | Business rules and transactions. |
| Policies | `src/server/policies/` | Authorization: role + relationship checks (e.g. "is this bus on the customer's hotel?"). |
| Data access | `src/lib/db/prisma.ts` | Single Prisma client (driver adapter `@prisma/adapter-pg`). |
| Auth & context | `src/lib/auth/{pin,session,current-user}.ts`, `src/server/services/{auth,events,context}.ts` | PIN hashing, sessions with event context, event access checks; `eventOf(actor)` scopes every query. |
| Config | `src/config/env.ts` | Zod-validated environment variables; fails fast. |
| i18n | `src/i18n/`, `messages/{en,hi}.json` | next-intl; locale in the URL (`/en/…`, `/hi/…`), remembered in a cookie. |

`src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) only handles locale routing. It is **not** a security boundary.

## Admin UI pattern

- Pages are server components: `requireStaff()` → service call (policy enforced inside) → render. `orNotFound()` turns forbidden/missing into a 404.
- Forms use `<ActionForm action={serverAction}>` (`src/components/ui/ActionForm.tsx`) with `<TextField>`/`<SelectField>`. It submits via `startTransition` (keeps typed input on validation errors), disables the button while pending, shows translated messages and field errors, and can ask for confirmation.
- Directories use cursor pagination (`src/server/services/pagination.ts`, 25 per page) with search/filters in the URL query string.
- Services throw `AppError` (`src/server/errors.ts`) with a stable `reason` translated under `errors.reasons.*`.
- Only the `common`, `auth`, `nav`, `forms` and `errors` message namespaces are sent to the browser; server components translate everything else.

## Accessibility and i18n conventions (Phase 6)

- Every page has one `h1`; sections use `h2`. A translated skip link targets `<main id="main">`.
- Interactive elements are at least 44 px tall (`min-h-11`/`min-h-12`); "Back" links use `<BackLink>`. Icons are decorative (`aria-hidden`) and always accompanied by text.
- Live regions: status/location panels use `aria-live="polite"`; form errors use `role="alert"`.
- `[locale]/loading.tsx` (translated, spinner respects reduced motion), `[locale]/error.tsx` (translated, `retry()`), `[locale]/not-found.tsx`.
- Language switcher keeps the query string; users' preferred language (`User.preferredLocale`) is set on `/profile` and used after sign-in.
- Audit action labels live under `audit.actions.<group>.<name>` in both locales; unknown actions fall back to the raw key.
- Soft hyphens (U+00AD) may be used in long nav labels.

## Roles

`OWNER`, `ADMIN`, `COORDINATOR`, `CUSTOMER`. The brief names three account types; coordinators are given their own role so their extra power (controlling an assigned bus trip) is granted explicitly rather than by making them Admins. A coordinator's scope is their designated hotel and the trips they are assigned to.

## Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 App Router, TypeScript strict | Required stack; one deployable. `cacheComponents` is left off: almost every page is per-user and dynamic. |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Required stack; Prisma 7 uses driver adapters and `prisma.config.ts`. |
| Sign-in | Phone + 6-digit PIN for Owner/Admin/Coordinator (scrypt; setup codes from admins); phone number + event for attendees | Zero recurring cost (no SMS/OTP provider). Trade-offs in SECURITY.md. |
| Events | `Event` table; hotels belong to an event; `EventMember` holds attendee/coordinator registration and the attendee's hotel per event; session stores the selected event | Multiple independent events; one account per phone can attend several events. Owner/Admin access all events. |
| Sessions | Own `Session` table; random 256-bit token in an HttpOnly, Secure, SameSite=Lax cookie; only the SHA-256 hash is stored | Persistent login, instant revocation on sign-out or deactivation, no secrets in localStorage. |
| Live updates | Polling `GET /api/buses/[id]/live` (20 s during a trip, 60 s idle, visible pages only) | No paid realtime service. Simple; cost scales with viewers × poll rate (see DEPLOYMENT.md › Cost review). |
| Maps | Google Maps JavaScript API via `@vis.gl/react-google-maps` | Required; lazy-loaded on map pages only. |
| Rate limiting | Fixed-window counters in PostgreSQL (`RateLimitBucket`) | No extra service needed at this scale; replaceable by Redis later. |

## Attendee views (Phase 4)

- `/[locale]/customer`: transport first (each bus: status panel, location freshness, link to tracking), then hotel (map + address + Maps link), then coordinator (call button). Data: `getCustomerHome` (scoped by the user's current `hotelId`).
- `/[locale]/track/[busId]`: status, location freshness, map (hotel, numbered stops, bus marker green if live / grey if stale), coordinator on board, ordered stops. Data: `getTrackedBus` (policy `canViewBus`; inactive buses hidden from non-staff; anything not allowed → 404). Used by attendees, coordinators and staff ("See what attendees see").
- `src/lib/transport/status.ts`: `STATUS_KIND` (boarding/moving/arrived) and `locationFreshness` (live/stale/none against `EventConfig.staleLocationSeconds`). Stale positions are always labelled and drawn grey.
- Maps: `src/components/maps/LocationMap.tsx` loads `@vis.gl/react-google-maps` with `next/dynamic` (browser only, only on pages with a map). No key, a placeholder key, or a load/auth failure → text fallback. No polylines: straight lines between stops would misrepresent roads.

## Trips, status and GPS (Phase 5)

```
Coordinator phone                         Server                                  Attendee browsers
useGeolocationSharing ──POST /api/locations──► recordLocation()                    useBusLive (per bus)
 watchPosition + 30 s heartbeat            auth + canSendLocation + event + Zod    ◄── GET /api/buses/{id}/live
 send ≥10 s, or ≥5 s & moved ≥25 m         conditional upsert BusLocation               every 20 s (60 s idle)
 retry w/ backoff, Wake Lock               (only newer recordedAt wins)
TripControls ──Server Actions──► trips.ts   sampled LocationPoint (historySample)
 big status buttons + statusVersion
```

- `src/server/services/trips.ts`: `startTrip` (one active trip per bus via partial unique index + explicit check; one per coordinator), `endTrip` (deletes the live `BusLocation`, keeps history), `changeStatus` (optimistic `statusVersion`; stale submissions rejected; `BusStatusEvent` row; staff corrections audited), `setSharing`, `recordLocation` (rejects future clocks > 2 min, ignores readings > 30 min old or out of order; 30/min per trip limit).
- Snapshot polled by browsers (`BusLiveSnapshot`): `{busId, trip:{status,statusChangedAt,sharingLocation}|null, location:{lat,lng,accuracy,recordedAt}|null}`, ~200 bytes.
- Viewers merge updates so an older location never replaces a newer one; relative times tick client-side (`useNow`).
- `scripts/prune.ts` / `pruneOldData()`: retention for history points, sessions, rate-limit rows.

Mobile browsers pause JavaScript when the screen locks or the tab is backgrounded, so tracking is only reliable while the coordinator keeps the page open. Continuous background tracking would need a native app.
