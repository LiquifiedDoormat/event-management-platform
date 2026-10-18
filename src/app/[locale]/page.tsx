import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { roleHome } from "@/server/services/auth";

// Entry point: send signed-in users to their role's homepage, everyone else to login.
export default async function IndexPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const user = await getCurrentUser();
  redirect({ href: user ? roleHome(user.role) : "/login", locale });
}
