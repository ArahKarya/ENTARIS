// Parser Markdown ringan (murni): pemecah blok + validasi tautan. Dipakai Markdown.tsx.

/** Hanya skema aman; selain itu tautan menjadi teks biasa. */
export function safeHref(raw: string): { href: string; internal: boolean } | null {
  const href = raw.trim();
  if (/^\/(?!\/)/.test(href)) return { href, internal: true };
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return { href, internal: false };
  return null;
}

const isTableSep = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string): string[] => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'code'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ t: 'code', text: buf.join('\n') });
    } else if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ t: 'h', text: line.replace(/^#{1,6}\s+/, '') });
      i++;
    } else if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(ordered ? { t: 'ol', items } : { t: 'ul', items });
    } else if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ t: 'table', head, rows });
    } else {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])) buf.push(lines[i++]);
      blocks.push({ t: 'p', text: buf.join('\n') });
    }
  }
  return blocks;
}

