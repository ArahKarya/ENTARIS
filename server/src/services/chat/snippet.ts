// Cuplikan hasil pencarian riwayat chat (murni).

export function makeSnippet(content: string, q: string, radius = 90): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const idx = flat.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat;
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + q.length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}
