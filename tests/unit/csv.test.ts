import { describe, expect, it } from "vitest";
import { neutralizeFormula, toCsv } from "@/lib/csv";

describe("neutralizeFormula", () => {
  it.each(["=SUM(A1:A9)", "+1+1", "-1+1", "@SUM(1,1)"])("disarms a value starting with %s", (value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`);
  });

  it.each(["Vikram Shah", "12 MG Road", "", "O'Brien", "9876543210", "A - Lakeview"])(
    "leaves an ordinary value %j untouched",
    (value) => {
      expect(neutralizeFormula(value)).toBe(value);
    },
  );
});

describe("toCsv", () => {
  it("neutralizes a formula-like cell while still quoting/escaping normally", () => {
    const csv = toCsv([
      ["name", "notes"],
      ["=cmd|calc!A1", "contains, a comma"],
    ]);
    expect(csv).toBe("name,notes\r\n'=cmd|calc!A1,\"contains, a comma\"\r\n");
  });

  it("does not alter a value that merely contains a risky character mid-string", () => {
    const csv = toCsv([["Hotel A - Lakeview"]]);
    expect(csv).toBe("Hotel A - Lakeview\r\n");
  });
});
