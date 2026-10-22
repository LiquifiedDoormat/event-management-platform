import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPerson } from "@/server/services/people";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import { PersonDetail } from "@/components/people/PersonDetail";

export default async function CoordinatorPage({ params }: PageProps<"/[locale]/coordinators/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const person = await orNotFound(getPerson(user, id));
  if (person.role !== "COORDINATOR" && person.role !== "CLUSTER_COORDINATOR") notFound();
  return <PersonDetail user={user} person={person} backHref="/coordinators" />;
}
