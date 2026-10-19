// Renderer Markdown ringan & AMAN-XSS untuk jawaban AIRA: hanya menghasilkan elemen React
// (tanpa innerHTML), HTML mentah ditampilkan sebagai teks, dan tautan dibatasi ke http(s)/mailto
// atau path internal. Mendukung: paragraf, judul, daftar, kode (inline/blok), tebal/miring, tabel, tautan.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { parseBlocks, safeHref } from './markdownParse';

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const key = `${keyBase}-${n++}`;
    const tok = m[0];
    if (m[1]) {
      out.push(<code key={key} className="rounded-sm bg-neutral-subtle px-1 py-0.5 font-mono text-[0.85em] text-neutral-text">{tok.slice(1, -1)}</code>);
    } else if (m[2]) {
      out.push(<strong key={key} className="font-semibold">{renderInline(tok.slice(2, -2), key)}</strong>);
    } else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      const link = mm ? safeHref(mm[2]) : null;
      if (mm && link) {
        const cls = 'font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
        out.push(
          link.internal ? (
            <Link key={key} to={link.href} className={cls}>{mm[1]}</Link>
          ) : (
            <a key={key} href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>{mm[1]}</a>
          ),
        );
      } else {
        out.push(tok);
      }
    } else {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const withBreaks = (text: string, key: string): ReactNode[] =>
  text.split('\n').flatMap((line, i, arr) => [...renderInline(line, `${key}-l${i}`), ...(i < arr.length - 1 ? [<br key={`${key}-br${i}`} />] : [])]);

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn('space-y-2 break-words', className)}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        if (b.t === 'p') return <p key={key}>{withBreaks(b.text, key)}</p>;
        if (b.t === 'h') return <p key={key} className="font-semibold text-foreground">{renderInline(b.text, key)}</p>;
        if (b.t === 'code') {
          return (
            <pre key={key} className="overflow-x-auto rounded-md border border-border bg-neutral-subtle p-3 font-mono text-xs text-neutral-text">
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.t === 'ul' || b.t === 'ol') {
          const List = b.t;
          return (
            <List key={key} className={cn('space-y-1 pl-5', b.t === 'ul' ? 'list-disc' : 'list-decimal')}>
              {b.items.map((it, ii) => <li key={`${key}-${ii}`}>{renderInline(it, `${key}-${ii}`)}</li>)}
            </List>
          );
        }
        return (
          <div key={key} className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <thead className="bg-neutral-subtle text-neutral-text">
                <tr>{b.head.map((c, ci) => <th key={ci} scope="col" className="px-2.5 py-1.5 font-medium">{renderInline(c, `${key}-h${ci}`)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-border">
                    {r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5">{renderInline(c, `${key}-r${ri}c${ci}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
