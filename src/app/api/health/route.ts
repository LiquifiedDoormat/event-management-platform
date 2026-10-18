import { prisma } from "@/lib/db/prisma";

// Liveness + database connectivity check for uptime monitors. Exposes no details.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
