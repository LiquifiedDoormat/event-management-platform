// Bulk-import entity configuration: column names, which are required, and the
// downloadable template content. Shared by the preview/commit service, the
// template-download route and the import form.

export type ImportEntity = "hotels" | "coordinators" | "attendees" | "buses";

export const IMPORT_ENTITIES: ImportEntity[] = ["hotels", "coordinators", "attendees", "buses"];

export const IMPORT_COLUMNS: Record<ImportEntity, { required: string[]; optional: string[] }> = {
  hotels: { required: ["name", "address"], optional: ["latitude", "longitude", "notes"] },
  coordinators: { required: ["name", "phone"], optional: ["hotelName"] },
  attendees: { required: ["name", "phone"], optional: ["hotelName", "address"] },
  buses: { required: ["label", "hotelName"], optional: ["registration", "routeNotes", "coordinatorPhone"] },
};

const SAMPLE_ROWS: Record<ImportEntity, string[][]> = {
  hotels: [["Grand Palace", "12 MG Road, Bengaluru", "12.9716", "77.5946", "Near the lake entrance"]],
  coordinators: [["Asha Rao", "9876543210", "Grand Palace"]],
  attendees: [["Vikram Shah", "9876500001", "Grand Palace", "12 MG Road, Bengaluru 560001"]],
  buses: [["Bus 1", "Grand Palace", "KA01AB1234", "Departs 8:30 AM", "9876543210"]],
};

/** Header row + one example row, for the downloadable CSV template. */
export function templateRows(entity: ImportEntity): string[][] {
  const { required, optional } = IMPORT_COLUMNS[entity];
  return [[...required, ...optional], ...SAMPLE_ROWS[entity]];
}
