/** A hotel's room-occupancy standing, derived from active room inventory and assignments. */
export type HotelOccupancyStatus = "full" | "partial" | "vacant" | "noInventory";

export const OCCUPANCY_ICON: Record<HotelOccupancyStatus, string> = {
  full: "🟢",
  partial: "🟡",
  vacant: "⚪",
  noInventory: "❔",
};

export const OCCUPANCY_BADGE_TONE: Record<HotelOccupancyStatus, "ok" | "warn" | "neutral" | "info"> = {
  full: "ok",
  partial: "warn",
  vacant: "neutral",
  noInventory: "info",
};

/**
 * A hotel's occupancy, from its active rooms' capacity and current
 * occupants — never guest counts alone. No active rooms (none added yet, or
 * all deactivated) is `noInventory`, kept distinct from a genuinely empty
 * `vacant` hotel so missing/incomplete room data is never mislabeled.
 */
export function hotelOccupancy(rooms: { capacity: number; occupied: number }[]) {
  const roomCount = rooms.length;
  const capacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  // Assignments are capacity-checked on write (see services/rooms.ts), but
  // never let a display value go negative or past capacity even so.
  const occupied = Math.min(rooms.reduce((sum, r) => sum + r.occupied, 0), capacity);
  const available = Math.max(capacity - occupied, 0);
  const status: HotelOccupancyStatus =
    roomCount === 0 ? "noInventory" : occupied === 0 ? "vacant" : occupied >= capacity ? "full" : "partial";
  return { capacity, occupied, available, status };
}
