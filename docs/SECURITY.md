# Security

## Principles

- Every protected operation checks, on the server: authenticated session → active account → role allows the action → resource is in the user's scope → input is valid (Zod).
- Hidden buttons, client routing and `src/proxy.ts` are never relied on for access control.
- Customers' scope is derived from `User.hotelId` read on every request, so a hotel reassignment takes effect immediately.

## Secrets

- `.env` and `.env.*` are git-ignored; `.env.example` holds placeholders only.
- `NEXT_PUBLIC_*` variables reach the browser. Only the restricted Google Maps browser key and the Pusher public key/cluster belong there.
- The local Docker database password comes from `.env`. The CI workflow uses a throwaway `ci:ci` database that exists only inside the job's container.
- Never log OTPs, session tokens, provider credentials or full phone numbers (use `maskPhone`).

## Authentication (Phase 2)

- Phone OTP via Twilio Verify (server-side start + check). The `dev` provider is refused when `NODE_ENV=production` (enforced in `src/config/env.ts`).
- Sessions: random token in an HttpOnly, Secure, SameSite=Lax cookie; SHA-256 hash in `Session.tokenHash`; expiry + revocation; all sessions revoked on deactivation.
- CSRF: SameSite=Lax cookies plus an `Origin`/`APP_URL` check on state-changing route handlers. Server actions get Next.js's built-in origin check.
- Rate limits per phone number and per IP on OTP send/verify; generic responses to avoid revealing whether a number is registered.
- Accounts are provisioned only by Owner/Admin. Owner accounts are created only with the bootstrap script, never through the UI.

## HTTP headers

Set in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocation on our own origin only), `Strict-Transport-Security`. A Content-Security-Policy will be added once the Google Maps and Pusher origins are wired in.

## Personal data

- Customers never see other attendees. They see only the phone numbers of their own hotel's coordinator.
- GPS history is sampled and deleted after `EventConfig.locationRetentionDays` (default 7). Only the latest position is kept per bus.
