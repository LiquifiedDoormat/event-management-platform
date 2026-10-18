// Applies migrations to the test database once before integration tests.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("[tests] TEST_DATABASE_URL not set: integration tests will be skipped.");
    return;
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
