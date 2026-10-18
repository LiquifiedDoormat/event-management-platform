import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale detection and redirects only. Authentication and authorization are
// enforced on the server in every page, route handler and server action, never here alone.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next.js internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
