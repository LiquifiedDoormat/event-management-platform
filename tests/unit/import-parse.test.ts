import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet } from "@/lib/import/parse";
import { ImportError } from "@/lib/import/errors";
import { MAX_DATA_ROWS } from "@/lib/import/limits";

const csvFile = (text: string, name = "data.csv") => new File([text], name, { type: "text/csv" });

describe("parseSpreadsheet (csv)", () => {
  it("parses headers and rows, trimming cells", async () => {
    const { headers, rows } = await parseSpreadsheet(csvFile("name,address\n Grand Palace , 12 MG Road \nSea View,1 Beach Rd\n"));
    expect(headers).toEqual(["name", "address"]);
    expect(rows).toEqual([
      ["Grand Palace", "12 MG Road"],
      ["Sea View", "1 Beach Rd"],
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", async () => {
    const { rows } = await parseSpreadsheet(csvFile('name,notes\n"Grand Palace","Near the ""lake"" entrance, gate 2"\n'));
    expect(rows).toEqual([["Grand Palace", 'Near the "lake" entrance, gate 2']]);
  });

  it("pads short rows with empty strings", async () => {
    const { rows } = await parseSpreadsheet(csvFile("name,address,notes\nSea View,1 Beach Rd\n"));
    expect(rows).toEqual([["Sea View", "1 Beach Rd", ""]]);
  });

  it("rejects an empty file", async () => {
    await expect(parseSpreadsheet(csvFile(""))).rejects.toMatchObject({ code: "emptyFile" });
  });

  it("rejects a header-only file (no data rows)", async () => {
    await expect(parseSpreadsheet(csvFile("name,address\n"))).rejects.toMatchObject({ code: "emptyFile" });
  });

  it("rejects an unsupported file type", async () => {
    await expect(parseSpreadsheet(csvFile("name,address\nA,B\n", "data.txt"))).rejects.toMatchObject({ code: "unsupportedFileType" });
  });

  it("rejects a file over the size limit", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "data.csv", { type: "text/csv" });
    await expect(parseSpreadsheet(big)).rejects.toMatchObject({ code: "fileTooLarge" });
  });

  it("rejects more data rows than the cap", async () => {
    const rows = Array.from({ length: MAX_DATA_ROWS + 1 }, (_, i) => `Hotel ${i},Addr ${i}`).join("\n");
    await expect(parseSpreadsheet(csvFile(`name,address\n${rows}\n`))).rejects.toMatchObject({ code: "tooManyRows" });
  });

  it("errors are ImportError instances", async () => {
    const err = await parseSpreadsheet(csvFile("")).catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
  });
});

describe("parseSpreadsheet (xlsx)", () => {
  it("parses a real workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["name", "address"]);
    sheet.addRow(["Grand Palace", "12 MG Road"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "data.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const { headers, rows } = await parseSpreadsheet(file);
    expect(headers).toEqual(["name", "address"]);
    expect(rows).toEqual([["Grand Palace", "12 MG Road"]]);
  });
});
