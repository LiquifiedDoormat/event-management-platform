import { describe, expect, it } from "vitest";
import { hashPin, isWeakPin, verifyPin } from "@/lib/auth/pin";

describe("PIN hashing", () => {
  it("verifies the right PIN only; hashes are salted", async () => {
    const a = await hashPin("482915");
    const b = await hashPin("482915");
    expect(a).not.toBe(b);
    expect(a).not.toContain("482915");
    expect(await verifyPin("482915", a)).toBe(true);
    expect(await verifyPin("482916", a)).toBe(false);
    expect(await verifyPin("482915", null)).toBe(false);
    expect(await verifyPin("482915", "garbage")).toBe(false);
  });

  it("rejects easily guessed PINs", () => {
    for (const weak of ["000000", "111111", "123456", "654321", "345678"]) expect(isWeakPin(weak)).toBe(true);
    for (const ok of ["482915", "102938", "135791"]) expect(isWeakPin(ok)).toBe(false);
  });
});

