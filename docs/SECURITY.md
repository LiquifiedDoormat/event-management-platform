# Security

## Principles

- Every protected operation checks, on the server: authenticated session → active account → role allows the action → resource is in the user's scope → input is valid (Zod).
- Hidden buttons, client routing and `src/proxy.ts` are never relied on for access control.
- A user's role, status and hotel are re-read from the database on every request (`validateSession`), so deactivation, role changes and hotel reassignment take effect immediately.

## Secrets

- `.env` and `.env.*` are git-ignored; `.env.example` holds placeholders only.
- `NEXT_PUBLIC_*` variables reach the browser. Only the (optional) restricted Google Maps browser key belongs there.
- The local Docker database password comes from `.env`. The CI workflow uses a throwaway `ci:ci` database that exists only inside the job's container.
- Never log PINs, session tokens or full phone numbers (use `maskPhone`).

## Authentication (Phase 8: no SMS/OTP)

| Concern | Implementation |
| --- | --- |
| Staff sign-in | Owner/Admin/Coordinator: phone + 6-digit PIN (`src/server/services/auth.ts`). PINs hashed with scrypt (N=16384, r=8, p=1, 16-byte salt; `src/lib/auth/pin.ts`); never stored or logged in clear. Weak PINs (one repeated digit, straight runs) refused. |
| First PIN / reset | The sign-in page asks for the phone number first; if that Owner/Admin/Coordinator account has **no PIN yet**, the person chooses one there (owner decision 2026-10-19: no setup code). Only one request can set it (conditional update on `pinHash IS NULL`); it is audit-logged (`auth.pinSet`) and still needs event access. A reset (Owner → Admin/Coordinator; Admin → Coordinator; Owner via `npm run owner:create -- --reset-pin`) clears the PIN and lockout and revokes all sessions. Attendee and unknown numbers get the same "enter PIN" answer, so the check does not reveal which numbers are staff without a PIN. |
| Brute force | Per-account lockout: 5 wrong PINs → 15 min lock (audited). Rate limits (PostgreSQL, hashed keys): 10/15 min per phone, 60/15 min per IP for PIN and setup attempts. |
| Attendee sign-in | Phone number registered (EventMember) for the chosen active event; no PIN or code. Rate limits: 10/15 min per phone, 120/15 min per IP. Attendee sessions are read-only by role. |
| Enumeration | All failures return the same `invalid_credentials` (unknown number, wrong PIN, no PIN yet, wrong event for attendees). Only a correct PIN can reveal "not registered for this event". Lockout responses can reveal that a number has a privileged account after 5 failures. |
| Event access | Session stores the selected event; `validateSession` re-checks it on every request: attendees/coordinators must still be registered and the event active; Owner/Admin may access every event. Switching events is a server action that re-checks access and never changes memberships. |
| Sessions | 256-bit random token in cookie `__Host-session` (`session` in dev): HttpOnly, Secure (prod), SameSite=Lax. DB stores SHA-256 only. 30 days of inactivity, renewed ≤ once/day. Sign-out revokes; deactivation, phone change, role change and PIN reset revoke all sessions. |
| CSRF | SameSite=Lax + `isSameOrigin()` on JSON routes (Origin = request host or `APP_URL`); Server Actions have Next.js's origin check. |
| Owner accounts | Only via `npm run owner:create`; the app can never grant OWNER. |

### Residual risks (accepted, documented)

- **6-digit PIN** = 1,000,000 combinations. Lockout + rate limits make online guessing slow (≈ 480 guesses/day per account), but a PIN is weaker than a strong password and can be shoulder-surfed. Mitigations: weak-PIN rejection, lockout alerts in the audit log, admin resets.
- **Attendee impersonation:** anyone who knows an attendee's phone number and event can view that attendee's read-only page: their name, hotel, its coordinator's contact, their buses and stops. They cannot change anything or see other attendees. Accepted by the project owner to keep attendee sign-in simple (no codes, no SMS). Stronger options if needed later: per-person codes or SMS (cost).
- **Unclaimed accounts (accepted risk):** while an Admin/Coordinator account has no PIN (new, or just reset), anyone who knows that phone number can choose its PIN and sign in as them. Mitigations: ask people to sign in and set their PIN immediately after being added or reset; check People → PIN status ("No PIN yet"); review `auth.pinSet` in the audit log — if the real person can't sign in, reset the PIN and revoke the intruder's sessions. Rate limits apply.

## Permission matrix (implemented in `src/server/policies/index.ts`)

| Action | Owner | Admin | Coordinator | Customer |
| --- | :-: | :-: | :-: | :-: |
| View all hotels, buses, people; event dashboard | ✅ | ✅ | — | — |
| Create / update hotels and buses, edit bus stops | ✅ | ✅ | — | — |
| Create accounts | any role except Owner | Customers only | — | — |
| Edit people | all except other Owners | Customers & Coordinators | — | — |
| Deactivate hotels, buses, people | ✅ | — | — | — |
| First hotel allotment for an attendee (no hotel yet) | ✅ | ✅ | — | — |
| Change attendee hotel; hotel coordinator; bus hotel; bus coordinator | ✅ | — | — | — |
| Change roles; platform settings; audit log | ✅ | — | — | — |
| Create / edit events (any event); switch events | ✅ | ✅ | switch between own events only | — |
| Deactivate / reactivate events | ✅ | — | — | — |
| Reset PIN (clear it; chosen again at next sign-in) | Admins, Coordinators | Coordinators | — | — |
| Search attendees of own hotel(s) in current event | ✅ (People) | ✅ (People) | ✅ | — |
| Start/end trips | ✅ | ✅ | own designated buses | — |
| Change bus status | ✅ (correction) | ✅ (correction) | own active trip | — |
| Send GPS location | — | — | own active trip only | — |
| View own hotel, its coordinator (name + phone), its buses | ✅ | ✅ | designated hotel + hotels of own buses | own hotel only |
| View a person's details | everyone | everyone | self + attendees of hotels in scope | self only |

Nothing is hard-deleted through the app except bus stops (route configuration); everything else is deactivated to preserve history. Guard rails: a hotel with active buses/attendees can't be deactivated; a bus or coordinator on an active trip can't be deactivated or (coordinator) have their role changed; nobody can deactivate or change their own role; changing a person's phone number or deactivating them revokes all their sessions.

Mutations from pages go through Server Actions (`src/features/admin/actions.ts`), which Next.js only accepts from the same origin; every action calls a service that re-checks the policy. Directory and detail pages for hotels, buses, coordinators and people are Owner/Admin only; a 404 is shown for missing or forbidden records.

## Live tracking

- `POST /api/locations`: session + same-origin + Zod; accepted only from the coordinator of the trip's **active** trip (`canSendLocation`); others get 403, ended trips 409. Device timestamps more than 2 min in the future are rejected; old/out-of-order readings are ignored; 30 readings/min per trip.
- Status changes: trip coordinator, or Owner/Admin as an audited correction. `statusVersion` prevents stale overwrites.
- Realtime: private channels only; `/api/realtime/auth` signs a subscription only for users who may view that bus. Payloads contain no personal data (bus id, status, coordinates, timestamps).
- `GET /api/buses/{id}/live`: same access rule; 404 for anything not viewable.
- GPS history is sampled (default every 30 s) and pruned after 7 days (`npm run ops:prune`); the live position is deleted when a trip ends.

## Owner-only pages

- `/owner/audit` (`audit.view`) and `/owner/settings` (`config.update`) are Owner-only in the services, not just the pages. Settings bounds match the database CHECK constraint; each save is audited with the changed fields only.
- Users can change only their own preferred language (`/profile`); name, phone and hotel are staff-managed.

## Page redirects while streaming

Pages have a `loading.tsx`, so responses stream: a signed-out request for a protected page returns HTTP 200 containing only a redirect (client redirect + `<meta http-equiv="refresh">` to `/login`). `requireUser` runs before any data is loaded, so no protected content is sent. JSON API routes still return 401/403.

## HTTP headers

Set in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocation on our own origin only), `Strict-Transport-Security`. API responses send `Cache-Control: no-store`.

**Content-Security-Policy** (`src/proxy.ts`): a fresh nonce per page request; `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ Maps loader; `'unsafe-eval'` only in development), `style-src` allows inline styles (Google Maps needs them), images/connect limited to self and Google Maps, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests` in production. Verified in dev and in a local production build (no violations, pages hydrate). Not yet verified with a live Google Maps key on a real deployment.

**Same-origin check** (`isSameOrigin`): the browser's `Origin` must match the request's own host (works on preview URLs) or `APP_URL`.

**Cron endpoint** `/api/cron/prune`: requires `Authorization: Bearer $CRON_SECRET` (constant-time compare); refuses with 503 when no secret is configured.

**Load-test data**: `scripts/loadtest-seed.ts` creates sessions directly and refuses unless the database is local or named staging/load/test; tokens go to a git-ignored file.

## Personal data

- Customers never see other attendees. They see their own hotel coordinator's name and phone number, and, on a bus of their hotel that is on an active trip, the name and phone of the coordinator accompanying it (operational contact).
- The Google Maps browser key is public by design; protect it with HTTP-referrer and API restrictions, a budget alert and quota caps (README › Google Maps).
- GPS history is sampled and deleted after `EventConfig.locationRetentionDays` (default 7). Only the latest position is kept per bus.
- Rate-limit keys are SHA-256 hashes, not raw phone numbers or IPs.

## Pending

- Cleanup job for expired sessions and rate-limit buckets (Phase 7 operations).
- PIN sign-in verified locally (tests + API); not yet on a deployment.
