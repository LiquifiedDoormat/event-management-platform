/** Minimal CSV writer (escapes quotes/commas/newlines), CRLF line endings. */
export function toCsv(rows: string[][]): string {
  const esc = (c: string) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return `${rows.map((r) => r.map(esc).join(",")).join("\r\n")}\r\n`;
}
