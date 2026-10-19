// Build command used by Vercel (package.json "vercel-build").
//
// Production deployments apply pending migrations before building
// (`prisma migrate deploy` only ever applies committed migrations; it never
// resets or drops data). Preview deployments do NOT migrate by default, so a
// pull request can never change the production database. Set
// MIGRATE_ON_BUILD=1 on previews only if they use their own database.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const isProduction = process.env.VERCEL_ENV === "production";
const migrate = isProduction || process.env.MIGRATE_ON_BUILD === "1";

if (migrate) {
  if (!process.env.DATABASE_URL) {
    console.error("vercel-build: DATABASE_URL is not set; cannot apply migrations. Add it in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  console.log(`vercel-build: applying migrations (${isProduction ? "production" : "MIGRATE_ON_BUILD=1"})`);
  run("npx prisma migrate deploy");
} else {
  console.log(`vercel-build: skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
}
run("npx next build");
