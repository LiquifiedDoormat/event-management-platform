import { describe, expect, it } from "vitest";
import { hashPin, hashSetupCode, isWeakPin, newSetupCode, verifyPin } from "@/lib/auth/pin";

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

describe("setup codes", () => {
  it("are readable, unambiguous and compared case/format-insensitively", () => {
    const code = newSetupCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(hashSetupCode(code.toLowerCase().replace("-", " "))).toBe(hashSetupCode(code));
  });
});
