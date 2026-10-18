// Runs before every test file. Points the app at the TEST database only.
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const dbName = new URL(testUrl).pathname.slice(1);
  if (!/(test|ci)/i.test(dbName)) {
    throw new Error("TEST_DATABASE_URL must name a database containing 'test' or 'ci'; refusing to run.");
  }
  process.env.DATABASE_URL = testUrl;
} else {
  // Never let tests fall through to the development database.
  process.env.DATABASE_URL = "postgresql://no-test-database-configured@127.0.0.1:1/none";
}
process.env.APP_URL ??= "http://localhost:3000";
process.env.OTP_PROVIDER = "dev";
