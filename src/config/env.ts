import "server-only";
import { z } from "zod";

// Server-side environment, validated once at first use. Fails fast with a clear,
// secret-free message listing only the names of missing or invalid variables.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().startsWith("postgres"),
    OTP_PROVIDER: z.enum(["dev", "twilio"]).default("dev"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.OTP_PROVIDER === "dev") {
      ctx.addIssue({ code: "custom", path: ["OTP_PROVIDER"], message: "dev OTP provider is not allowed in production" });
    }
    if (env.OTP_PROVIDER === "twilio") {
      for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when OTP_PROVIDER=twilio" });
      }
    }
  });

export type ServerEnv = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
