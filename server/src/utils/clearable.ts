// Partial-update helper for optional text columns:
// undefined = keep the stored value, null/blank = clear it, otherwise trimmed text.
export function clearable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
