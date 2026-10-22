# Import templates — जन्मशताब्दी 2026 (full-scale test dataset)

**Every record in these files is fictional sample data — `SAMPLE-HOTEL-NNN`,
`SAMPLE-COORD-NNNN`, `SAMPLE-GUEST-NNNNN`, `SAMPLE-BUS-NNNN`, fake phone numbers, placeholder
addresses. None of it is a real registration. Replace it before a real production import.**

Matched exactly against the current importer (`src/server/services/import.ts`,
`src/lib/import/entities.ts`, `src/lib/validation/entities.ts`) — not guessed. Validated by
running every file through the real `previewImport`/`commitImport` service code against the
local test database (never production) — see "Validation performed" below.

## Files and record counts

| File | Records | Notes |
| --- | --- | --- |
| `01-hotels.csv` | 70 | |
| `02-hotel-coordinators.csv` | 150 | one coordinator per bus (1:1), matched to the same hotel as their bus |
| `03-attendees-batch-01.csv` … `batch-08.csv` | 2,000 each, 16,000 total | split because the importer caps a single upload at **2,000 data rows** (`lib/import/limits.ts`'s `MAX_DATA_ROWS`) — not a limitation invented for this task, the real upload form enforces it |
| `04-buses.csv` | 150 | each references its hotel and its one responsible coordinator |

Hotels get 1–3 buses each (10 hotels ×1, 40 ×2, 20 ×3 = 150) and roughly 228–229 attendees each
(40 hotels ×229, 30 ×228 = 16,000) — a plausible spread, not a real room-allocation plan.

## Import order (required) and exact steps on the site

1. Sign in as **Owner** (coordinators and a bus's `coordinatorPhone` are Owner-only imports;
   Admin can do hotels/attendees/buses-without-coordinatorPhone).
2. Select event **जन्मशताब्दी 2026** in the event switcher.
3. Go to **Import**, pick the entity, upload the file, review the preview (validates every row
   against the live database, writes nothing), confirm.
4. Repeat in this exact order — each step's rows reference the one(s) before it by name/phone,
   not by internal ID:
   1. `01-hotels.csv`
   2. `02-hotel-coordinators.csv` (needs hotels from step 1)
   3. `03-attendees-batch-01.csv` through `batch-08.csv`, **in numeric order** (each batch is
      independent of the others — they don't reference each other — but importing in order
      keeps the attendee numbering easy to track if anything needs fixing)
   4. `04-buses.csv` (needs hotels from step 1 **and** coordinators already imported and active
      in this event from step 2 — buses always go last)

## Not supported by the importer — do this by hand instead

- **Clusters and cluster coordinators**: no bulk-import entity exists for either — only
  `hotels` / `coordinators` / `attendees` / `buses` are importable entities in the code. Not a
  missing template; the feature isn't there. If जन्मशताब्दी 2026 uses clusters, create them at
  **Clusters → Add cluster** after hotels exist, then add hotels/cluster-coordinators from each
  cluster's own page.
- **Zones and gates**: same — create at **Zones** after hotels/attendees exist, or use the
  bulk zone-assignment tool on a zone's own page (assigns a whole hotel's attendees at once).
- The event itself is **not** an import row — you already created जन्मशताब्दी 2026 on the site.

## Columns, file by file

### `01-hotels.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Unique enough that later files can reference it by exact text. |
| `address` | yes | Free text. |
| `latitude`, `longitude` | no | Blank in every sample row — fill **both** or leave **both** blank (one without the other is rejected). |
| `notes` | no | Free text. |

### `02-hotel-coordinators.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | |
| `phone` | yes | Sample numbers use a `90` + 8-digit sequence (`9000000001`…`9000000150`), globally unique in this dataset. Becomes their sign-in number; they choose a PIN at first sign-in. |
| `hotelName` | no (used in every sample row) | Must match a `01-hotels.csv` name exactly. One coordinator → at most one hotel; a hotel may have several coordinators. |

### `03-attendees-batch-NN.csv` (×8)
| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | |
| `phone` | yes | Sample numbers use a `92` + 8-digit sequence (`9200000001`…`9200016000`), unique across all 8 batches. |
| `hotelName` | no (used in every sample row) | Must match a `01-hotels.csv` name. |
| `address` | no | Postal address — shown only to the attendee themself and to Owner/Admin; hotel/cluster coordinators never see it even though they can see name/phone. |

### `04-buses.csv`
| Column | Required | Notes |
| --- | --- | --- |
| `label` | yes | Shown to attendees, e.g. "SAMPLE-BUS-0007". |
| `hotelName` | yes | Must match `01-hotels.csv`. |
| `registration` | no | Blank in every sample row (unknown). If given, must be unique event-wide. |
| `routeNotes` | no | Free text. |
| `coordinatorPhone` | no (used in every sample row) | Must already be imported (step 2) and active in this event. **One coordinator → one responsible bus**: assigning here moves them off any other bus. Owner only — blank this column if importing as Admin. |

## Validation performed

- Exact headers checked against `IMPORT_COLUMNS` in `lib/import/entities.ts` — not guessed.
- Ran all 11 files (hotels, coordinators, 8 attendee batches, buses), in the order above,
  through the real `previewImport` then `commitImport` service functions against the local
  **test** database (never production, and the throwaway event/records were removed after) —
  every row valid, every file committed with zero failures.
- Confirmed after import: 70 hotels, 150 buses, 16,000 attendee memberships, 150 coordinator
  memberships, every bus has exactly one coordinator, and no two buses share a coordinator
  (the one-responsible-coordinator-per-bus rule holds).
- Checked record counts match the requested scale exactly: 70 / 150 / 16,000 / 150.
- All files are plain UTF-8 CSV with CRLF line endings; free-text fields were kept comma-free
  by design, so no field needs CSV quoting — safe to open in any spreadsheet tool or re-save
  without worrying about embedded commas shifting columns.

## What you still need to supply before this is real

- Real hotel names/addresses (and GPS coordinates, optional, for the embedded map).
- Real coordinator names and mobile numbers per hotel.
- The actual attendee registration list — names, numbers, hotel assignment, postal address if collected. At 16,000 rows you'll very likely be exporting this from another system (registration form, spreadsheet) rather than typing it by hand — just match these exact column headers.
- Real bus labels/registrations and which coordinator is responsible for each (can also be set later from each bus's own page instead of via CSV).
- Whether जन्मशताब्दी 2026 uses clusters — if yes, set them up manually (see above) after hotels/coordinators are imported.
