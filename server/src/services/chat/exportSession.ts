// Ekspor satu sesi milik sendiri sebagai Markdown atau JSON.

import { prisma } from '../../lib/prisma';
import { getOwnedSession } from './sessionService';

export interface ExportResult {
  fileName: string;
  body: string;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sesi';

const fmt = (d: Date): string => d.toISOString().replace('T', ' ').slice(0, 16);

export async function exportSession(userId: string, sessionId: string, format: 'md' | 'json'): Promise<ExportResult | null> {
  const s = await getOwnedSession(userId, sessionId);
  if (!s) return null;
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, role: { in: ['user', 'assistant'] } },
    orderBy: { seq: 'asc' },
    include: { attachments: { select: { fileName: true } } },
  });
  const title = s.title || 'Percakapan AIRA';
  const base = `${slug(title)}-${s.id.slice(0, 8)}`;
  if (format === 'json') {
    const body = JSON.stringify(
      {
        id: s.id,
        title,
        createdAt: s.createdAt,
        messages: rows.map((m) => ({ role: m.role, status: m.status, at: m.createdAt, content: m.content, attachments: m.attachments.map((a) => a.fileName) })),
      },
      null,
      2,
    );
    return { fileName: `${base}.json`, body };
  }
  const lines = [`# ${title}`, '', `Diekspor dari Entaris · dibuat ${fmt(s.createdAt)} UTC`, ''];
  for (const m of rows) {
    lines.push(`## ${m.role === 'user' ? 'Anda' : 'AIRA'} · ${fmt(m.createdAt)}${m.status !== 'ok' ? ` (${m.status})` : ''}`, '');
    lines.push(m.content || '_(kosong)_', '');
    if (m.attachments.length) lines.push(`Lampiran: ${m.attachments.map((a) => a.fileName).join(', ')}`, '');
  }
  return { fileName: `${base}.md`, body: lines.join('\n') };
}
