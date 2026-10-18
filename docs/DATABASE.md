# Database

PostgreSQL 17 (local: Docker; production: a managed service such as Neon or Supabase). Prisma 7 with the `@prisma/adapter-pg` driver adapter. Schema: `prisma/schema.prisma`. Connection URL: `prisma.config.ts` → `DATABASE_URL`.

## Entities

| Model | Purpose | Key constraints |
| --- | --- | --- |
| `User` | Every account (Owner, Admin, Coordinator, Customer). `hotelId` = attendee's allotted hotel. | `phone` unique, E.164 CHECK; index `(role,status)`, `hotelId`, `name` |
| `Hotel` | Hotel, address, coordinates, notes, active flag. | `coordinatorId` unique (one designated coordinator per hotel, one hotel per coordinator); coords CHECK |
| `Bus` | Permanent bus record, assigned to one hotel, optional default coordinator. | `hotelId` required (RESTRICT delete); `registration` unique |
| `BusStop` | Ordered route stops per bus; editable when routes change. | unique `(busId, sequence)`; `sequence > 0`; coords CHECK |
| `Trip` | One run of a bus with a coordinator on board. Holds current `status`, `statusVersion`, `sharingLocation`. | **partial unique index: one active trip (`endedAt IS NULL`) per bus**; `endedAt >= startedAt` |
| `BusLocation` | Latest position per bus (1 row per bus, overwritten). Separated from static data. | PK `busId`; coords + accuracy CHECK |
| `LocationPoint` | Sampled trip history, pruned by retention policy. | index `(tripId, recordedAt)`, `recordedAt` |
| `BusStatusEvent` | Status change history for accountability. | index `(tripId, createdAt)`, `(busId, createdAt)` |
| `Session` | Server-side sessions; only the SHA-256 of the cookie token is stored. | `tokenHash` unique; index `userId`, `expiresAt` |
| `RateLimitBucket` | Fixed-window counters for OTP/auth rate limiting. | PK `key`; index `expiresAt` |
| `AuditLog` | Sensitive admin actions (who, what, which record, changed fields). | index `(entityType, entityId)`, `actorId`, `createdAt` |
| `EventConfig` | Single row (`id = 1`): event name, stale-location threshold, GPS retention, history sampling. | `id = 1` CHECK; bounds CHECK |

Bus status enum: `BOARDING`, `TO_HOTEL`, `AT_HOTEL`, `TO_STOP`, `AT_STOP`.

## Deletion behaviour

Records with history are **deactivated** (`isActive` / `status = INACTIVE`), not deleted. Foreign keys use `RESTRICT` where deleting would orphan operational data (hotel → buses/attendees, bus → trips), `SET NULL` for optional links (coordinator assignments, audit actor), and `CASCADE` only for data owned by its parent (stops, locations, sessions).

## Hand-written SQL

Prisma can't express partial unique indexes or CHECK constraints. They are appended to the bottom of `prisma/migrations/20261018133949_init/migration.sql`. When adding similar constraints later, create the migration with `npx prisma migrate dev --create-only --name <name>`, edit the SQL, then run `npx prisma migrate dev`.

## Commands

| Task | Command |
| --- | --- |
| Start local DB | `npm run db:up` |
| Create/apply migration (dev) | `npm run db:migrate -- --name <change>` |
| Apply migrations (prod/CI) | `npm run db:deploy` |
| Regenerate client | `npm run db:generate` (also runs on `npm install`) |
| Seed demo data (local only) | `npm run db:seed` |
| Browse data | `npm run db:studio` |

## Migration policy

- Every migration is committed. Production only ever runs `prisma migrate deploy`.
- Never run `migrate reset`, `db push --force-reset` or drop tables against production.
- Fix a bad migration with a new forward migration, never by editing one that has been deployed.
- Back up the production database (provider snapshot) before deploying a migration that changes or removes columns.

## Seed data

`prisma/seed.ts` creates fake demo data (2 hotels, 2 coordinators, 2 buses with stops, 10 attendees, 1 admin) with phone numbers in the `+9199999xxxxx` range. It upserts by stable keys, so it's safe to re-run, and it refuses to run unless `DATABASE_URL` points at `localhost`. It never creates an Owner.
