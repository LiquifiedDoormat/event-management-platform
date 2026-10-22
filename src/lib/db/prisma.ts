import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/config/env";

// One client per server instance, created on first use (not at import time, so
// `next build` doesn't need runtime configuration). In development, reuse it
// across hot reloads so we don't exhaust database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString: env().DATABASE_URL,
      // Bounded well below Neon's connection limit: each serverless instance
      // gets its own pool, and DATABASE_URL is already the pooled (pgbouncer)
      // endpoint in production, which is the layer meant to absorb the real
      // fan-out across many instances. Load-tested locally at 5/10/20 — pool
      // size made no measurable difference to p50/p95 latency under 500
      // concurrent pollers (the bottleneck there was elsewhere), so this stays
      // low for the connection-count benefit without a throughput cost.
      max: 10,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      // Belt-and-braces: a single stuck query must not hold a pool connection
      // forever and starve every other request on this instance.
      statement_timeout: 10_000,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
