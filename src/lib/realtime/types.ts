// Shared by server and browser. Small on purpose: viewers poll it.
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
