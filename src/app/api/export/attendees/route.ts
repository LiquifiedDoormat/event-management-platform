import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getApiUser } from "@/lib/auth/current-user";
import { exportAttendees } from "@/server/services/people";
import { neutralizeFormula, toCsv } from "@/lib/csv";

const HEADERS = ["name", "phone", "hotel", "zone", "gender", "address"];

/** Attendee export (name, phone, hotel, zone, gender, postal address) as CSV or XLSX (?format=xlsx). Staff only — the address column is PII. */
export async function GET(req: NextRequest) {
  const user = await getApiUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) return new Response("Not found", { status: 404 });

  const rows = await exportAttendees(user);
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendees");
    sheet.addRow(HEADERS);
    // XLSX cells are typed, so ExcelJS already writes these as text rather than
    // formulas — neutralized anyway for defense-in-depth and consistency with
    // the CSV path, which has no such type information to rely on.
    for (const r of rows) {
      sheet.addRow([r.name, r.phone, r.hotel, r.zone, r.gender, r.address].map(neutralizeFormula));
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendees.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = toCsv([HEADERS, ...rows.map((r) => [r.name, r.phone, r.hotel, r.zone, r.gender, r.address])]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendees.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
