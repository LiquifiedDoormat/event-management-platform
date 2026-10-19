import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read directly (not with prisma's env(), which throws when unset) so that
    // `prisma generate` — run by `npm install` on CI/Vercel — works without a
    // database. Commands that connect (migrate, seed, studio) still need it.
    // Migrations prefer a direct (non-pooled) connection when one is provided;
    // the app itself always uses DATABASE_URL (pooled in production).
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
});
