import "server-only";
import Pusher from "pusher";
import { BUS_EVENT, busChannel, pusherPublic, type BusLiveSnapshot } from "./types";

/**
 * Distributes bus updates to subscribed browsers. Swap the implementation to
 * change provider; the rest of the app only sees this interface.
 */
export interface RealtimePublisher {
  readonly enabled: boolean;
  publishBus(snapshot: BusLiveSnapshot): Promise<void>;
  /** Signs a private-channel subscription (Pusher's channel auth). */
  authorize(socketId: string, channel: string): unknown;
}

const clean = (v: string | undefined) => (v && !v.startsWith("<") ? v : undefined);

class PusherPublisher implements RealtimePublisher {
  readonly enabled = true;
  constructor(private readonly client: Pusher) {}

  async publishBus(snapshot: BusLiveSnapshot) {
    try {
      // One publish per change; Pusher handles the fan-out to every viewer.
      await this.client.trigger(busChannel(snapshot.busId), BUS_EVENT, snapshot);
    } catch (err) {
      // Never fail a status/location write because realtime is down; clients poll as a fallback.
      console.error("[realtime] publish failed", (err as Error).name);
    }
  }

  authorize(socketId: string, channel: string) {
    return this.client.authorizeChannel(socketId, channel);
  }
}

/** Used when Pusher isn't configured: clients fall back to polling. */
const disabled: RealtimePublisher = {
  enabled: false,
  async publishBus() {},
  authorize() {
    throw new Error("realtime not configured");
  },
};

let instance: RealtimePublisher | undefined;

export function realtime(): RealtimePublisher {
  if (instance) return instance;
  const appId = clean(process.env.PUSHER_APP_ID);
  const secret = clean(process.env.PUSHER_SECRET);
  const { key, cluster } = pusherPublic;
  instance =
    appId && secret && key && cluster
      ? new PusherPublisher(new Pusher({ appId, key, secret, cluster, useTLS: true, timeout: 5000 }))
      : disabled;
  return instance;
}

/** Test hook. */
export function setRealtimeForTests(publisher: RealtimePublisher | undefined) {
  instance = publisher;
}
