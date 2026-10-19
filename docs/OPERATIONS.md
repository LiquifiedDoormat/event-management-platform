# Operations

## Monitoring

| What | Where |
| --- | --- |
| App up + database reachable | `GET /api/health` → `{"ok":true,"database":"up"}` (503 if DB down). Add it to an uptime monitor (e.g. UptimeRobot, every 1–5 min). |
| Errors and slow requests | Vercel → Project → Logs / Observability. Server logs never contain OTPs, tokens or full phone numbers. |
| SMS delivery | Twilio Console → Monitor → Logs → Verify |
| Live updates | Pusher dashboard → Debug console / Overview (connections, messages) |
| Maps usage and cost | Google Cloud → Google Maps Platform → Metrics; Billing → Budgets |
| Daily cleanup | Vercel → Project → Settings → Cron Jobs (last run of `/api/cron/prune`) |

## Scheduled jobs

`/api/cron/prune` runs daily at 03:00 IST (21:30 UTC, `vercel.json`). It deletes GPS history older than the retention setting (Owner → Event settings), sessions expired/revoked more than 7 days ago, and expired rate-limit rows. Manual run: `npm run ops:prune` with `DATABASE_URL` set.

## Event-day checklist

- [ ] Smoke test passed on the production URL (DEPLOYMENT.md §5) the day before.
- [ ] Every bus has a coordinator; Owner home shows no "needs attention" items.
- [ ] Coordinators have tested sign-in and location sharing on their own phones, know to keep the trip page open with the screen on, and have a charger/power bank.
- [ ] Twilio balance topped up; Google Maps budget alert set; Pusher plan sized for expected viewers.
- [ ] Help desk has the Owner/Admin sign-in and knows how to look people up (People → search by name or phone).

## Troubleshooting

**Nobody can sign in**
1. `/api/health` — is the database up?
2. Login shows "SMS service is not available": check Twilio status page and Console logs (account balance, Verify service SID, geo permissions for India). Signed-in users are unaffected; sessions last 30 days of inactivity.
3. "Too many attempts": rate limits (5 codes/15 min per number, 30 per network). Wait 15 minutes; on shared venue Wi-Fi, ask people to use mobile data.
4. One person can't sign in: check People → their number is correct and the account is Active.

**Bus location not updating**
1. Coordinator's trip screen: is it "Sharing location"? If "Location access was blocked", follow the on-screen help (site settings → allow Location).
2. The phone locked or the browser went to the background → sharing pauses. Ask the coordinator to keep the page open; it resumes automatically when they return.
3. Attendee page says "Updates every 15 seconds" instead of "Live updates on": Pusher isn't configured or is unreachable; polling still works.
4. Check Vercel logs for `/api/locations` responses (403 = wrong coordinator, 409 = trip ended).

**Database errors**
- Health check shows `"database":"down"`: check Neon status/console; connection limits (use the pooled URL for `DATABASE_URL`).
- After a failed production migration, the deployment fails and the old version keeps running. Fix the migration in a new commit; never edit an already-applied migration.

**Failed deployment**
- Vercel → Deployments → the failed build → log. Common causes: missing `DATABASE_URL` in Production (migrations), TypeScript/lint errors (CI catches these on PRs), migration errors.

## Load testing

Scripts: `tests/load/event-day.js` (k6). Run **only** against a local or staging deployment with its own database.

```bash
npx tsx scripts/loadtest-seed.ts --attendees 2000 --hotels 10 --buses-per-hotel 2
```
```bash
k6 run -e BASE_URL=https://<staging-url> -e COOKIE=__Host-session -e VIEWERS=2000 -e BUSES=20 tests/load/event-day.js
```
```bash
npx tsx scripts/loadtest-seed.ts --cleanup
```

Use `COOKIE=session` against a local `npm run dev`/`npm start` over HTTP. Delete `tests/load/.tokens.json` afterwards.

**Workload:** 2,000 attendees open their homepage and a bus page, then poll the live endpoint every 15 s (worst case: no Pusher); 20 coordinators send GPS every ~6 s; 5 staff search directories.

**Targets (thresholds in the script):** error rate < 1%; p95 < 300 ms for live polling and GPS updates; p95 < 1.5 s for pages and searches.

**Results:**

| Date | Environment | Viewers | Error rate | p95 live poll | p95 GPS | p95 pages | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| — | not yet run | | | | | | Needs a staging deployment (see PROJECT_MEMORY.md) |
