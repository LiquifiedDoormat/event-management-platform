// A cell starting with one of these is interpreted as a formula by Excel/
// Sheets/LibreOffice when a CSV is opened, regardless of the value's actual
// type — unlike XLSX, plain CSV carries no type information to say otherwise.
// Guest/hotel names and addresses are free text an attendee or coordinator
// can set, so this is real untrusted input, not a hypothetical.
const RISKY_LEADING_CHAR = /^[=+\-@]/;

/** Disarms a value that would be read as a spreadsheet formula, leaving every other value untouched. */
export function neutralizeFormula(cell: string): string {
  return RISKY_LEADING_CHAR.test(cell) ? `'${cell}` : cell;
}

/** Minimal CSV writer (escapes quotes/commas/newlines, neutralizes formula-injection), CRLF line endings. */
export function toCsv(rows: string[][]): string {
  const esc = (c: string) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return `${rows.map((r) => r.map((c) => esc(neutralizeFormula(c))).join(",")).join("\r\n")}\r\n`;
}
