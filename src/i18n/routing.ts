import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "hi"],
  defaultLocale: "en",
  // The chosen language is remembered in the NEXT_LOCALE cookie by next-intl.
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
