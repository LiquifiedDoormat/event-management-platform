# Security

## Principles

- Every protected operation checks, on the server: authenticated session → active account → role allows the action → resource is in the user's scope → input is valid (Zod).
- Hidden buttons, client routing and `src/proxy.ts` are never relied on for access control.
- A user's role, status and hotel are re-read from the database on every request (`validateSession`), so deactivation, role changes and hotel reassignment take effect immediately.

## Secrets

- `.env` and `.env.*` are git-ignored; `.env.example` holds placeholders only.
- `NEXT_PUBLIC_*` variables reach the browser. Only the restricted Google Maps browser key and the Pusher public key/cluster belong there.
- The local Docker database password comes from `.env`. The CI workflow uses a throwaway `ci:ci` database that exists only inside the job's container.
- Never log OTPs, session tokens, provider credentials or full phone numbers (use `maskPhone`). Exception: the `dev` OTP provider prints codes to the local console by design; it is refused when `NODE_ENV=production`.

## Authentication (implemented, Phase 2)

| Concern | Implementation |
| --- | --- |
| OTP delivery/verification | `OtpProvider` interface (`src/lib/auth/otp/`). `twilio`: Twilio Verify REST API (Twilio generates, sends and checks codes; we store nothing). `dev`: local only; codes hashed in memory, 10-minute expiry, 5 attempts. |
| Account provisioning | Login only works for existing, ACTIVE accounts created by staff. The phone number identifies the account; it doesn't create one. |
| Enumeration | `/api/auth/otp/request` returns the same `{sent: true}` for unknown, inactive and registered numbers (no SMS is sent for the first two). Verify failures return a generic `invalid_code`. Note: response timing can still differ slightly because only registered numbers call the SMS provider. |
| Rate limits | `src/lib/rate-limit` (PostgreSQL, hashed keys). Send: 5/phone and 30/IP per 15 min. Verify: 8/phone and 60/IP per 15 min (phone counter reset on success). Twilio Verify adds its own limits. |
| Sessions | 256-bit random token in cookie `__Host-session` (`session` in dev): HttpOnly, Secure (prod), SameSite=Lax, Path=/. DB stores only SHA-256(token). Valid for 30 days of inactivity, extended at most once a day on use. |
| Revocation | Sign-out revokes the session row. `revokeAllSessions(userId)` signs a user out everywhere. Deactivated users fail validation immediately even before revocation. |
| CSRF | SameSite=Lax cookie, plus `isSameOrigin()` on every state-changing route handler (Origin must equal `APP_URL`; falls back to `Sec-Fetch-Site: same-origin`). |
| Provider outage | Returns `provider_unavailable` (HTTP 503) with a translated message asking users to retry or contact the help desk. Existing sessions are unaffected, so signed-in users keep working. |
| Owner accounts | Created only by `npm run owner:create` (needs direct DB access). The app can never grant OWNER. |

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
| Change roles; event settings; audit log | ✅ | — | — | — |
| Start/end trips | ✅ | ✅ | own designated buses | — |
| Change bus status | ✅ (correction) | ✅ (correction) | own active trip | — |
| Send GPS location | — | — | own active trip only | — |
| View own hotel, its coordinator (name + phone), its buses | ✅ | ✅ | designated hotel + hotels of own buses | own hotel only |
| View a person's details | everyone | everyone | self + attendees of hotels in scope | self only |

Nothing is hard-deleted through the app except bus stops (route configuration); everything else is deactivated to preserve history. Guard rails: a hotel with active buses/attendees can't be deactivated; a bus or coordinator on an active trip can't be deactivated or (coordinator) have their role changed; nobody can deactivate or change their own role; changing a person's phone number or deactivating them revokes all their sessions.

Mutations from pages go through Server Actions (`src/features/admin/actions.ts`), which Next.js only accepts from the same origin; every action calls a service that re-checks the policy. Directory and detail pages for hotels, buses, coordinators and people are Owner/Admin only; a 404 is shown for missing or forbidden records.

## HTTP headers

Set in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocation on our own origin only), `Strict-Transport-Security`. A Content-Security-Policy will be added once the Google Maps and Pusher origins are wired in. API responses send `Cache-Control: no-store`.

## Personal data

- Customers never see other attendees. They see only their own hotel coordinator's name and phone number.
- GPS history is sampled and deleted after `EventConfig.locationRetentionDays` (default 7). Only the latest position is kept per bus.
- Rate-limit keys are SHA-256 hashes, not raw phone numbers or IPs.

## Pending

- Cleanup job for expired sessions and rate-limit buckets (Phase 7 operations).
- Content-Security-Policy (after Maps/Pusher integration).
- Twilio integration not yet verified against a real account.
