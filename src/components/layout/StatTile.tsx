export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-3xl font-bold tabular-nums">{value.toLocaleString("en-IN")}</p>
      <p className="text-muted">{label}</p>
    </div>
  );
}
