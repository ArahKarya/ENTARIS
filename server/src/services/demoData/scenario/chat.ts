// Sample AIRA panel conversations for the demo admin. There is no REST route that stores messages
// without calling the engine, so these use the chat services directly. Every figure in the answers
// is read from the demo data itself, so the transcript matches what the screens show.

import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { IDENTITY_BLOCK_VERSION, type ActorSnapshot } from '../../../ai/identityBlock';
import { createSession } from '../../chat/sessionService';
import { createAssistantPlaceholder, createUserMessage, finalizeAssistant } from '../../chat/messageStore';
import { overdueWhere } from '../../salesInvoiceList';
import type { DemoContext } from '../context';

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
const MODEL = 'demo';

async function exchange(ctx: DemoContext, sessionId: string, question: string, answer: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.admin.id }, select: { airaTier: true, airaJabatan: true } });
  const snapshot: ActorSnapshot = {
    uid: ctx.admin.id,
    role: ctx.admin.role,
    airaTier: user.airaTier,
    airaJabatan: user.airaJabatan,
    toolsetHash: 'demo',
    blockVersion: IDENTITY_BLOCK_VERSION,
  };
  const turnId = randomUUID();
  await createUserMessage({ sessionId, turnId, content: question, snapshot });
  const placeholder = await createAssistantPlaceholder(sessionId, turnId, MODEL);
  await finalizeAssistant({ messageId: placeholder.id, sessionId, content: answer, status: 'ok', durationMs: 2400, model: MODEL });
}

async function receivablesAnswer(ctx: DemoContext): Promise<string> {
  const overdue = await prisma.salesInvoice.findMany({
    // Same filter as the sales invoice list, so the answer matches the screen.
    where: { partyId: { in: Object.values(ctx.parties) }, ...overdueWhere(new Date()) },
    select: { invoiceNumber: true, outstanding: true, dueDate: true, customer: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
  });
  if (overdue.length === 0) return 'Saat ini tidak ada piutang yang lewat jatuh tempo.';
  const total = overdue.reduce((s, i) => s + Number(i.outstanding), 0);
  const lines = overdue.slice(0, 5).map((i) => `- ${i.invoiceNumber} · ${i.customer.name} · ${rupiah(Number(i.outstanding))}`);
  return [
    `Ada ${overdue.length} invoice yang lewat jatuh tempo dengan total ${rupiah(total)}:`,
    ...lines,
    '',
    'Saya bisa menyiapkan daftar penagihan per Customer kalau diperlukan.',
  ].join('\n');
}

async function lowStockAnswer(ctx: DemoContext): Promise<string> {
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: ['berasPremium', 'berasMedium', 'minyak', 'gula'].map((k) => ctx.items[k].id) } },
    select: { name: true, unit: true, currentStock: true, minimumStock: true },
    orderBy: { name: 'asc' },
  });
  const lines = items.map((i) => `- ${i.name}: ${Number(i.currentStock).toLocaleString('id-ID')} ${i.unit}${Number(i.currentStock) < Number(i.minimumStock) ? ' (di bawah minimum)' : ''}`);
  return ['Posisi stok saat ini:', ...lines].join('\n');
}

export function scheduleChat(ctx: DemoContext): void {
  ctx.schedule(ctx.today, 'Contoh percakapan AIRA', async () => {
    const s1 = await createSession(ctx.admin.id, 'Piutang lewat jatuh tempo');
    await ctx.record('chat_sessions', s1.id);
    await exchange(ctx, s1.id, 'Piutang mana saja yang sudah lewat jatuh tempo?', await receivablesAnswer(ctx));

    const s2 = await createSession(ctx.admin.id, 'Cek stok gudang');
    await ctx.record('chat_sessions', s2.id);
    await exchange(ctx, s2.id, 'Bagaimana posisi stok beras dan barang dagang sekarang?', await lowStockAnswer(ctx));
  });
}
