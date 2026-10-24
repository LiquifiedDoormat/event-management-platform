import { setRequestLocale } from "next-intl/server";
import { getPerson } from "@/server/services/people";
import { requireUser } from "@/lib/auth/current-user";
import { redirect } from "@/i18n/navigation";
import { orNotFound } from "@/lib/utils/page";
import { PersonDetail } from "@/components/people/PersonDetail";

// Staff see any attendee; a cluster coordinator only one of their own
// cluster's (enforced by `getPerson`'s own canViewPerson check, not this
// route guard — a wrong id simply 404s).
export default async function PersonPage({ params }: PageProps<"/[locale]/people/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, ["OWNER", "ADMIN", "CLUSTER_COORDINATOR"]);
  const isStaff = user.role === "OWNER" || user.role === "ADMIN";
  if (isStaff && !user.eventId) redirect({ href: "/events", locale });
  const person = await orNotFound(getPerson(user, id));
  return <PersonDetail user={user} person={person} backHref="/people" />;
}
