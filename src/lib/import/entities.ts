// Bulk-import entity configuration: column names, which are required, and the
// downloadable template content. Shared by the preview/commit service, the
// template-download route and the import form.

export type ImportEntity = "hotels" | "coordinators" | "clusterCoordinators" | "attendees" | "buses";

export const IMPORT_ENTITIES: ImportEntity[] = ["hotels", "coordinators", "clusterCoordinators", "attendees", "buses"];

export const IMPORT_COLUMNS: Record<ImportEntity, { required: string[]; optional: string[] }> = {
  hotels: { required: ["name", "address"], optional: ["latitude", "longitude", "notes"] },
  // `cluster` optionally groups the row's hotel into a cluster (creating the
  // cluster if it doesn't exist yet) — it never affects the coordinator's own
  // assignment, which has no cluster of its own. See clusterCoordinators below.
  coordinators: { required: ["name", "phone"], optional: ["hotelName", "cluster"] },
  // A cluster coordinator's own assignment: `cluster` is required and both
  // creates the cluster if missing and assigns the coordinator to it.
  clusterCoordinators: { required: ["name", "phone", "cluster"], optional: [] },
  attendees: { required: ["name", "phone"], optional: ["hotelName", "address", "gender"] },
  buses: { required: ["label", "hotelName"], optional: ["registration", "routeNotes", "coordinatorPhone"] },
};

const SAMPLE_ROWS: Record<ImportEntity, string[][]> = {
  hotels: [["Grand Palace", "12 MG Road, Bengaluru", "12.9716", "77.5946", "Near the lake entrance"]],
  coordinators: [["Asha Rao", "9876543210", "Grand Palace", "North Zone"]],
  clusterCoordinators: [["Rohan Mehta", "9876543299", "North Zone"]],
  attendees: [["Vikram Shah", "9876500001", "Grand Palace", "12 MG Road, Bengaluru 560001", "Male"]],
  buses: [["Bus 1", "Grand Palace", "KA01AB1234", "Departs 8:30 AM", "9876543210"]],
};

/** Header row + one example row, for the downloadable CSV template. */
export function templateRows(entity: ImportEntity): string[][] {
  const { required, optional } = IMPORT_COLUMNS[entity];
  return [[...required, ...optional], ...SAMPLE_ROWS[entity]];
}
