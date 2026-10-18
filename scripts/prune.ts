// Data-retention cleanup. Run daily (cron / scheduled job) against DATABASE_URL:
//   npm run ops:prune
// See docs/OPERATIONS.md (Phase 7) and src/server/services/maintenance.ts.
import "dotenv/config";
import { pruneOldData } from "../src/server/services/maintenance";
import { prisma } from "../src/lib/db/prisma";

pruneOldData()
  .then((result) => console.log("prune complete", JSON.stringify(result)))
  .catch((err) => {
    console.error("prune failed:", (err as Error).name);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
