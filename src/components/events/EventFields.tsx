import { getTranslations } from "next-intl/server";
import { TextField } from "@/components/ui/Fields";

type Event = { name: string; startsOn: Date | null; endsOn: Date | null };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Fields shared by "new event" and "edit event". */
export async function EventFields({ event }: { event?: Event }) {
  const t = await getTranslations("events");
  return (
    <>
      <TextField name="name" label={t("name")} defaultValue={event?.name} required maxLength={120} />
      <div className="flex flex-wrap gap-3">
        <TextField name="startsOn" label={t("startsOn")} type="date" defaultValue={day(event?.startsOn ?? null)} />
        <TextField name="endsOn" label={t("endsOn")} type="date" defaultValue={day(event?.endsOn ?? null)} />
      </div>
    </>
  );
}
