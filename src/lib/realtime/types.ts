// Shared by server and browser. Keep the snapshot small: it is sent on every
// status change and accepted location update.
import type { BusStatus } from "@/generated/prisma/enums";

export type BusLiveSnapshot = {
  busId: string;
  trip: {
    status: BusStatus;
    statusChangedAt: string;
    sharingLocation: boolean;
  } | null;
  location: { latitude: number; longitude: number; accuracy: number | null; recordedAt: string } | null;
};

export const BUS_EVENT = "update";

/** Private channel per bus; Pusher calls /api/realtime/auth before subscribing. */
export const busChannel = (busId: string) => `private-bus-${busId}`;

export function parseBusChannel(channel: string): string | null {
  const m = /^private-bus-([A-Za-z0-9_-]{1,40})$/.exec(channel);
  return m ? m[1] : null;
}

// Placeholder values copied from .env.example ("<...>") count as "not configured".
const clean = (v: string | undefined) => (v && !v.startsWith("<") ? v : undefined);

/** Browser-side Pusher settings (public). */
export const pusherPublic = {
  key: clean(process.env.NEXT_PUBLIC_PUSHER_KEY),
  cluster: clean(process.env.NEXT_PUBLIC_PUSHER_CLUSTER),
};
