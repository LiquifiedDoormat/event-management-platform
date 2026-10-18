import { describe, expect, it } from "vitest";
import { busChannel, parseBusChannel } from "@/lib/realtime/types";

describe("bus channels", () => {
  it("round-trips a bus id", () => {
    expect(parseBusChannel(busChannel("cm1abc_2-x"))).toBe("cm1abc_2-x");
  });
  it.each(["private-bus-", "presence-bus-abc", "private-hotel-abc", "private-bus-abc/../x", "private-bus-" + "a".repeat(41)])(
    "rejects %s",
    (name) => expect(parseBusChannel(name)).toBeNull(),
  );
});
