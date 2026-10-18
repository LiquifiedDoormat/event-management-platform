import { setRequestLocale } from "next-intl/server";
import { getPerson } from "@/server/services/people";
import { orNotFound, requireStaff } from "@/lib/utils/page";
import { PersonDetail } from "@/components/people/PersonDetail";

export default async function PersonPage({ params }: PageProps<"/[locale]/people/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireStaff(locale);
  const person = await orNotFound(getPerson(user, id));
  return <PersonDetail user={user} person={person} backHref="/people" />;
}
