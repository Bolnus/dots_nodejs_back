/** Parses an optional integer from a query-string value. */
export function parseOptionalInt(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
