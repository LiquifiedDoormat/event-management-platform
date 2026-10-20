import "server-only";
import ExcelJS from "exceljs";
import { ImportError } from "./errors";
import { MAX_DATA_ROWS, MAX_FILE_BYTES } from "./limits";

export type ParsedSheet = { headers: string[]; rows: string[][] };

/**
 * Minimal, non-backtracking CSV parser (no regex), so a hostile file can't
 * cause a ReDoS. Handles quoted fields, embedded commas/newlines and "" escapes.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnyField = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      sawAnyField = true;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAnyField = false;
    } else if (c === "\r") {
      // ignore; \r\n handled by the following \n
    } else {
      field += c;
      sawAnyField = true;
    }
  }
  if (sawAnyField || field !== "") row.push(field);
  if (row.length) rows.push(row);
  return rows;
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result !== undefined) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("");
    return "";
  }
  return String(value);
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      values.push(cellToString(cell.value).trim());
    });
    // Trim trailing empty cells (eachRow pads to the row's last written column).
    while (values.length && values[values.length - 1] === "") values.pop();
    if (values.length) rows.push(values);
  });
  return rows;
}

/** Parses an uploaded .csv/.xlsx file into a header row + data rows. Never writes anything. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new ImportError("emptyFile");
  if (file.size > MAX_FILE_BYTES) throw new ImportError("fileTooLarge");
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isXlsx = name.endsWith(".xlsx");
  if (!isCsv && !isXlsx) throw new ImportError("unsupportedFileType");

  let grid: string[][];
  try {
    grid = isCsv ? parseCsv(await file.text()) : await parseXlsx(await file.arrayBuffer());
  } catch {
    throw new ImportError("malformedFile");
  }

  const [headerRow, ...dataRows] = grid.filter((r) => r.some((c) => c !== ""));
  if (!headerRow) throw new ImportError("emptyFile");
  if (dataRows.length === 0) throw new ImportError("emptyFile");
  if (dataRows.length > MAX_DATA_ROWS) throw new ImportError("tooManyRows");

  const headers = headerRow.map((h) => h.trim());
  return { headers, rows: dataRows.map((r) => headers.map((_, i) => (r[i] ?? "").trim())) };
}
