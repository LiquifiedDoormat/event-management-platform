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
    url: process.env.DATABASE_URL ?? "",
  },
});
