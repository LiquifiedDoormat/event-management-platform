import type { NextRequest } from "next/server";
import { getApiUser } from "@/lib/auth/current-user";
import { IMPORT_ENTITIES, templateRows, type ImportEntity } from "@/lib/import/entities";
import { toCsv } from "@/lib/csv";

/** Downloadable sample CSV (header + one example row) for a bulk-import entity. Staff only. */
export async function GET(req: NextRequest) {
  const user = await getApiUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) return new Response("Not found", { status: 404 });

  const entity = new URL(req.url).searchParams.get("entity") as ImportEntity | null;
  if (!entity || !IMPORT_ENTITIES.includes(entity)) return new Response("Not found", { status: 404 });
  if ((entity === "coordinators" || entity === "clusterCoordinators") && user.role !== "OWNER") return new Response("Not found", { status: 404 });

  return new Response(toCsv(templateRows(entity)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${entity}-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
