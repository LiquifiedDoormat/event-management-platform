# Database

PostgreSQL 17 (local: Docker; production: a managed service such as Neon or Supabase). Prisma 7 with the `@prisma/adapter-pg` driver adapter. Schema: `prisma/schema.prisma`. Connection URL: `prisma.config.ts` → `DATABASE_URL`.

## Entities

| Model | Purpose | Key constraints |
| --- | --- | --- |
| `User` | Every account (Owner, Admin, Cluster Coordinator, Hotel Coordinator, Customer), one per phone. PIN fields: `pinHash` (scrypt; null = chooses a PIN at next sign-in), `failedPinAttempts`, `pinLockedUntil`. | `phone` unique, E.164 CHECK; index `(role,status)`, `name` |
| `Event` | An independent event: name, dates, active flag. | dates CHECK; index `(isActive,name)` |
| `Cluster` | Optional grouping of hotels within an event, for a cluster coordinator's oversight. | index `(eventId,name)` |
| `EventMember` | Attendee/coordinator registration for an event. `hotelId` = an attendee's hotel **or** a hotel coordinator's assigned hotel (several coordinators may share a hotel — nothing here makes it exclusive); `clusterId` = a cluster coordinator's assigned cluster. | unique `(eventId,userId)`; index `userId`, `hotelId`, `clusterId` |
| `Hotel` | Belongs to one event (`eventId`); address, coordinates, notes, active flag, optional `clusterId`. A hotel's coordinators are looked up as `EventMember` rows with that `hotelId` and `role = COORDINATOR`, not a direct relation — see `services/hotels.ts`. Each coordinator is assigned to at most one hotel (enforced in the service, not the schema, since it's a property of `EventMember.hotelId` being single-valued). | coords CHECK |
| `Bus` | Permanent bus record, assigned to one hotel, optional default coordinator. | `hotelId` required (RESTRICT delete); `registration` unique |
| `BusStop` | Ordered route stops per bus; editable when routes change. | unique `(busId, sequence)`; `sequence > 0`; coords CHECK |
| `Trip` | One run of a bus with a coordinator on board. Holds current `status`, `statusVersion`, `sharingLocation`. | **partial unique index: one active trip (`endedAt IS NULL`) per bus**; `endedAt >= startedAt` |
| `BusLocation` | Latest position per bus (1 row per bus, overwritten). Separated from static data. | PK `busId`; coords + accuracy CHECK |
| `LocationPoint` | Sampled trip history, pruned by retention policy. | index `(tripId, recordedAt)`, `recordedAt` |
| `BusStatusEvent` | Status change history for accountability. | index `(tripId, createdAt)`, `(busId, createdAt)` |
| `Session` | Server-side sessions; only the SHA-256 of the cookie token is stored; `eventId` = selected event. | `tokenHash` unique; index `userId`, `expiresAt` |
| `RateLimitBucket` | Fixed-window counters for PIN/attendee sign-in and GPS rate limits. | PK `key`; index `expiresAt` |
| `AuditLog` | Sensitive admin actions (who, what, which record, changed fields). | index `(entityType, entityId)`, `actorId`, `createdAt` |
| `EventConfig` | Single row (`id = 1`), platform-wide: stale-location threshold, GPS retention, history sampling. | `id = 1` CHECK; bounds CHECK |

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

## Migration `20261019060000_events_membership_pin` (Phase 8)

Hand-ordered for safety on existing data: creates `Event`/`EventMember`, adds nullable columns, then **only if hotels or attendees/coordinators exist** creates a default event `evt_default` (named from the old `EventConfig.eventName`), moves every hotel into it and turns each attendee/coordinator's `User.hotelId` into an `EventMember` row; then makes `Hotel.eventId` required, drops `User.hotelId` and `EventConfig.eventName`. On an empty database (first production deploy) no event is created. Verified on an empty database, the populated dev database and the test database; schema drift check clean. Production has never been deployed, so there is no production data to migrate yet.

## Migration `20261019070000_drop_event_attendee_code`

Drops the optional `Event.attendeeCodeHash` added in the previous migration (attendee event codes were removed before release). Never deployed to production.

## Migration `20261019080000_drop_pin_setup_code`

Drops `User.pinSetupCodeHash` and `User.pinSetupExpiresAt` (and the unique index): staff now choose their first PIN at sign-in when `pinHash` is null. Never deployed to production.

## Migration `20261021090000_cluster_and_multi_hotel_coordinators` (Aawas Yatra Phase 1)

Adds the `CLUSTER_COORDINATOR` role and the `Cluster` model, and replaces `Hotel.coordinatorId` (one coordinator per hotel) with many-to-many hotel coordinators expressed as `EventMember` rows (`hotelId` set, `role = COORDINATOR`) — several coordinators may now share a hotel; each coordinator is still assigned to at most one hotel. Hand-ordered for safety on existing data: adds the new enum value and tables/columns first, **backfills** every hotel's old `coordinatorId` into that coordinator's `EventMember.hotelId` (safe because every coordinator's membership row had a NULL `hotelId` before this — they were never used for coordinators), then drops `Hotel.coordinatorId` and its unique index. Verified on the populated local dev database (4 existing hotel-coordinator assignments backfilled correctly) and the test database; `prisma migrate status` clean afterward. Never deployed to production.
