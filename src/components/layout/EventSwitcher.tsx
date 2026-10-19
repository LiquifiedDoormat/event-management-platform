import { getTranslations } from "next-intl/server";
import type { SessionUser } from "@/lib/auth/session";
import { switchableEvents } from "@/server/services/events";
import { switchEventAction } from "@/features/events/actions";

/**
 * Shows the current event; lets users with access to several events switch.
 * The server re-checks access (switchEvent) — the list here is only a convenience.
 */
export async function EventSwitcher({ user }: { user: SessionUser }) {
  const [t, events] = await Promise.all([getTranslations("events"), switchableEvents(user)]);
  if (events.length <= 1) {
    return user.eventName ? <p className="w-full text-base text-muted">📅 {user.eventName}</p> : null;
  }
  return (
    <form action={switchEventAction} className="flex w-full flex-wrap items-end gap-2">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-base">
        <span className="font-semibold">{t("current")}</span>
        <select name="eventId" defaultValue={user.eventId ?? ""} className="min-h-11 rounded-md border-2 border-line bg-surface px-2">
          {!user.eventId && <option value="">—</option>}
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {!e.isActive ? ` (${t("inactive")})` : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-md border-2 border-brand px-3 font-semibold text-brand">
        {t("switch")}
      </button>
    </form>
  );
}
