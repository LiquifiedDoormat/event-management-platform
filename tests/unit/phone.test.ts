import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "@/lib/utils/phone";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+1 415 555 2671", "+14155552671"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "   ", "12345", "abcdefghij", "+91 12345 67890"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("keeps only the last four digits", () => {
    expect(maskPhone("+919876543210")).toBe("+••••••••3210");
  });
});
