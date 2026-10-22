# Import templates — जन्मशताब्दी 2026

**All data in these CSVs is SAMPLE DATA — fictional names, fake phone numbers, placeholder
addresses. Replace every row before importing into the real event.** Nothing here is a real
attendee, coordinator, or address.

Matched exactly against the current importer (`src/server/services/import.ts`,
`src/lib/import/entities.ts`, `src/lib/validation/entities.ts`) — not guessed.

## Import order (required)

Each file depends on records already existing from the one(s) before it, matched by **name**
(hotels) or **phone** (coordinators), not by internal ID — you never need a database ID for
these files.

1. **`01-hotels.csv`** — no dependencies.
2. **`02-hotel-coordinators.csv`** — `hotelName` must exactly match a hotel's `name` already
   imported in step 1 (case-insensitive, but match it exactly anyway to avoid typos).
3. **`03-attendees.csv`** — same `hotelName` rule as step 2.
4. **`04-buses.csv`** — `hotelName` as above; `coordinatorPhone` must match a coordinator who
   is **already imported (step 2) and a member of this event** — buses import after
   coordinators, never before.

Who's allowed to run each import, and where: sign in as Owner or Admin on the production site,
select event **जन्मशताब्दी 2026** in the event switcher, then **Import** in the nav. Pick the
entity, upload the CSV, review the preview (it validates every row without writing anything),
then confirm. Do this once per file, in the order above.

- Hotels, Attendees, Buses: **Owner or Admin**.
- Hotel Coordinators: **Owner only** (same as every other action that assigns a coordinator).
- A bus's `coordinatorPhone` column: **Owner only** — leave it blank if signed in as Admin; you
  can assign the coordinator afterward from the bus's own page.

## Not supported by the importer — do this by hand instead

- **Clusters** and **cluster coordinators** have no bulk-import entity at all (only
  `hotels` / `coordinators` / `attendees` / `buses` exist in the code). If जन्मशताब्दी 2026
  uses clusters, create them at **Clusters → Add cluster** after hotels are imported, then add
  hotels and cluster coordinators to each cluster from that cluster's own page. Not a missing
  template — the feature genuinely isn't there; don't invent a CSV format for it.
- **Zones and gates** (seating sections, entry gates) also have no bulk import — create them at
  **Zones** after hotels/attendees exist, or use the bulk zone-assignment tool on a zone's own
  page (assigns a whole hotel's attendees at once, no CSV needed).
- The event itself (जन्मशताब्दी 2026) is **not** an import row — you already created it on the
  site; these files only add hotels/people/buses *into* it.

## Columns, file by file

### `01-hotels.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Must be unique enough that coordinators/attendees/buses can reference it unambiguously by this exact text. |
| `address` | yes | Free text. |
| `latitude`, `longitude` | no | Leave **both** blank or fill **both** — one without the other is rejected. |
| `notes` | no | Free text. |

### `02-hotel-coordinators.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | |
| `phone` | yes | 10-digit Indian mobile (e.g. `9876500001`) or full `+91...`. This becomes their sign-in number — they choose a 6-digit PIN the first time they sign in. |
| `hotelName` | no | Omit/blank = coordinator created with no hotel yet (assign later). If set, must match a `01-hotels.csv` row. **One coordinator → one hotel**; several coordinators may share a hotel. |

### `03-attendees.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | |
| `phone` | yes | Their sign-in number — no PIN, no code, just the phone + the event. |
| `hotelName` | no | As above. An attendee with no hotel shows a "no hotel" warning in People until assigned. |
| `address` | no | Postal address. Stored, but only ever shown to the attendee themself and to Owner/Admin — hotel coordinators and cluster coordinators never see it, even though they can see the attendee's name/phone. |

### `04-buses.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `label` | yes | e.g. "Bus 1" — shown to attendees. |
| `hotelName` | yes | Must match a `01-hotels.csv` row. |
| `registration` | no | Vehicle registration. If given, must be unique across the whole event (not just the hotel) — leave blank if unknown. |
| `routeNotes` | no | Free text, e.g. departure time. |
| `coordinatorPhone` | no | Must match a phone from `02-hotel-coordinators.csv` that's already been imported **and** is active **and** already a member of this event. **One coordinator → one responsible bus**: assigning them here moves them off any other bus they were responsible for. Owner only — blank this column out if importing as Admin. |

## Duplicate / conflict handling (so you know what a rejected row means)

- A phone number already used by a different role in the system → that row is **invalid**
  (role mismatch), not silently skipped.
- A phone already registered for **this same event** → reported as a **duplicate**, skipped,
  not an error — safe to re-run a file after fixing only the rows that failed.
- A bus with the same `registration` (if given), or the same `label` at the same hotel when no
  registration is given → duplicate, skipped.
- Every file is previewed (validated against the real database) before anything is written —
  nothing commits until you confirm the preview, and each row writes independently, so one bad
  row never blocks the rest of the file.

## What you still need to supply before this is real

- Hotels: real names and addresses (and GPS coordinates if you want the embedded map to place them).
- Coordinators: real names and real mobile numbers for each hotel's coordinator(s).
- Attendees: the actual registration list — names, mobile numbers, which hotel, postal address if you're collecting it.
- Buses: how many per hotel, their labels/registration numbers, and which coordinator is responsible for each (if decided in advance — this can also be set later from each bus's own page instead of via CSV).
- Whether जन्मशताब्दी 2026 uses clusters at all — if yes, the cluster names and which hotels/cluster-coordinators belong to each (set up manually, see above).
