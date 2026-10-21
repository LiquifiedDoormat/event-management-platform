import { getApiUser } from "@/lib/auth/current-user";
import { exportAttendees } from "@/server/services/people";
import { toCsv } from "@/lib/csv";

/** Attendee export (name, phone, hotel, zone, postal address) as CSV. Staff only — the address column is PII. */
export async function GET() {
  const user = await getApiUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) return new Response("Not found", { status: 404 });

  const rows = await exportAttendees(user);
  const csv = toCsv([
    ["name", "phone", "hotel", "zone", "address"],
    ...rows.map((r) => [r.name, r.phone, r.hotel, r.zone, r.address]),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendees.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
