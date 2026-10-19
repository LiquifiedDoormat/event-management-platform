# Architecture

## Overview

A single Next.js (App Router) application deployed on Vercel, backed by managed PostgreSQL and a managed realtime service. No microservices.

```
Phone browser ──HTTPS──► Next.js (Vercel, stateless)
                           ├─ pages / server components (UI, per-role dashboards)
                           ├─ route handlers + server actions (validated with Zod)
                           │     └─ services → policies (authorization) → Prisma
                           ├─► PostgreSQL (managed; pooled connections)
                           └─► Pusher Channels (publish)  ──► subscribed browsers
```

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Routing / UI | `src/app/[locale]/…`, `src/components/` | Presentation only. Never the place where permissions are enforced. |
| HTTP entry points | `src/app/api/…` (JSON, used by login), `src/features/*/actions.ts` (Server Actions, used by forms) | Parse + validate input (Zod), call a service, map result to a response / `ActionState`. |
| Services | `src/server/services/` | Business rules and transactions. |
| Policies | `src/server/policies/` | Authorization: role + relationship checks (e.g. "is this bus on the customer's hotel?"). |
| Data access | `src/lib/db/prisma.ts` | Single Prisma client (driver adapter `@prisma/adapter-pg`). |
| Integrations | `src/lib/auth/otp/`, `src/lib/realtime/`, `src/lib/maps/` | Behind small interfaces so providers can be swapped. |
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
| Phone OTP | Twilio Verify behind an `OtpProvider` interface; `dev` provider for local work | Server-side send + check, built-in OTP rate limiting, supports Indian numbers (Twilio handles DLT for Verify). MSG91 is a cheaper India-only alternative that fits the same interface. |
| Sessions | Own `Session` table; random 256-bit token in an HttpOnly, Secure, SameSite=Lax cookie; only the SHA-256 hash is stored | Persistent login, instant revocation on sign-out or deactivation, no secrets in localStorage. |
| Realtime | Pusher Channels private channels, behind a `RealtimePublisher` interface | Managed fan-out (one publish per update regardless of viewers); private-channel auth endpoint lets the server authorize each subscription. |
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
 watchPosition + 30 s heartbeat            auth + canSendLocation + Zod            ◄── Pusher private-bus-{id} "update"
 send ≥10 s, or ≥5 s & moved ≥25 m         conditional upsert BusLocation          ◄── or GET /api/buses/{id}/live
 retry w/ backoff, Wake Lock               (only newer recordedAt wins)                 every 15 s (60 s when live)
TripControls ──Server Actions──► trips.ts   sampled LocationPoint (historySample)
 big status buttons + statusVersion         publishBus(snapshot) ──► RealtimePublisher (Pusher | disabled)
```

- `src/server/services/trips.ts`: `startTrip` (one active trip per bus via partial unique index + explicit check; one per coordinator), `endTrip` (deletes the live `BusLocation`, keeps history), `changeStatus` (optimistic `statusVersion`; stale submissions rejected; `BusStatusEvent` row; staff corrections audited), `setSharing`, `recordLocation` (rejects future clocks > 2 min, ignores readings > 30 min old or out of order; 30/min per trip limit).
- Snapshot sent to browsers (`BusLiveSnapshot`): `{busId, trip:{status,statusChangedAt,sharingLocation}|null, location:{lat,lng,accuracy,recordedAt}|null}`, ~200 bytes, one publish per change regardless of viewer count.
- `src/lib/realtime/publisher.ts`: `RealtimePublisher` interface; Pusher implementation; disabled implementation when env is missing. Publishing failures are logged and never fail the write.
- `/api/realtime/auth`: Pusher channel auth → `assertCanViewBus` (same rule as `/track`).
- Viewers merge updates so an older location never replaces a newer one; relative times tick client-side (`useNow`).
- `scripts/prune.ts` / `pruneOldData()`: retention for history points, sessions, rate-limit rows.

Mobile browsers pause JavaScript when the screen locks or the tab is backgrounded, so tracking is only reliable while the coordinator keeps the page open. Continuous background tracking would need a native app.
