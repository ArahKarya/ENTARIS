/**
 * Integrasi panel chat: sesi, kepemilikan (IDOR), pencarian, lampiran, hapus+audit, retensi,
 * resume lintas perangkat, kill switch, health, ekspor, dan tool memori chat_*.
 * Perlu DATABASE_URL (Postgres). Dilewati bila tidak ada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, TINY_PNG, type Harness, type TestUser } from '../helpers/chatHarness';
import { callMcpTool } from '../helpers/actorSigner';

const d = process.env.DATABASE_URL ? describe : describe.skip;

d('panel chat: sesi, kepemilikan, pencarian', () => {
  let h: Harness;
  let a: TestUser;
  let b: TestUser;
  let sessionA: string;

  beforeAll(async () => {
    h = await createHarness();
    a = await h.createUser('Accountant', { fullName: 'Ani Uji' });
    b = await h.createUser('Accountant', { fullName: 'Budi Uji' });
    h.agent.setBehavior(() => ({ chunks: ['Kode ', 'rahasia ', 'KEMBANG-77 tercatat.'] }));
    const r = await h.stream(a, { input: 'Tolong catat kode proyek KEMBANG-77 untuk kami' });
    sessionA = String(r.events.find((e) => e.event === 'session')?.data.session_id);
  });
  afterAll(async () => {
    await h.cleanup();
  });

  it('lists only own sessions with paging envelope; supports search by title and content', async () => {
    const mine = (await (await h.api(a, 'GET', '/api/ai/chat/sessions')).json()) as { data: Array<{ id: string }>; total: number; page: number; limit: number };
    expect(mine).toMatchObject({ total: 1, page: 1, limit: 30 });
    expect(mine.data[0].id).toBe(sessionA);
    const theirs = (await (await h.api(b, 'GET', '/api/ai/chat/sessions')).json()) as { total: number };
    expect(theirs.total).toBe(0);
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions?q=KEMBANG')).json()) as { total: number }).total).toBe(1);
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions?q=tidak-ada-sama-sekali')).json()) as { total: number }).total).toBe(0);
    expect(((await (await h.api(b, 'GET', '/api/ai/chat/sessions?q=KEMBANG')).json()) as { total: number }).total).toBe(0);
  });

  it('IDOR: another user cannot read, rename, archive, export, delete, or stream into the session', async () => {
    expect((await h.api(b, 'GET', `/api/ai/chat/sessions/${sessionA}/messages`)).status).toBe(404);
    expect((await h.api(b, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, { title: 'dibajak' })).status).toBe(404);
    expect((await h.api(b, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, { status: 'archived' })).status).toBe(404);
    expect((await h.api(b, 'GET', `/api/ai/chat/sessions/${sessionA}/export`)).status).toBe(404);
    expect((await h.api(b, 'DELETE', `/api/ai/chat/sessions/${sessionA}`)).status).toBe(404);
    const s = await h.stream(b, { input: 'masuk ke sesi orang', session_id: sessionA });
    expect(s.status).toBe(404);
    const still = (await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/messages`)).json()) as { data: unknown[]; session: { title: string } };
    expect(still.data.length).toBe(2);
    expect(still.session.title).not.toBe('dibajak');
  });

  it('an admin is not an exception: no list, read, search, export or stream into another user\'s session', async () => {
    const admin = await h.createUser('Admin', { airaTier: 'direct', fullName: 'Adi Admin' });
    const list = (await (await h.api(admin, 'GET', '/api/ai/chat/sessions?q=KEMBANG')).json()) as { total: number };
    expect(list.total).toBe(0);
    expect((await h.api(admin, 'GET', `/api/ai/chat/sessions/${sessionA}/messages`)).status).toBe(404);
    expect((await h.api(admin, 'GET', `/api/ai/chat/sessions/${sessionA}/export`)).status).toBe(404);
    expect((await h.api(admin, 'DELETE', `/api/ai/chat/sessions/${sessionA}`)).status).toBe(404);
    expect((await h.stream(admin, { input: 'intip', session_id: sessionA })).status).toBe(404);
    const found = await callMcpTool({ baseUrl: h.base, token: h.mcp.token, signingSecret: h.mcp.signingSecret, claims: { uid: admin.id, ch: 'panel' }, name: 'chat_cari_riwayat', args: { q: 'KEMBANG-77' } });
    expect((found.structured?.data as { data: unknown[] }).data).toHaveLength(0);
    expect(((await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/messages`)).json()) as { data: unknown[] }).data.length).toBe(2);
  });

  it('message history: ascending, cursor paging, never exposes the identity block or actor snapshot', async () => {
    const res = (await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/messages?limit=1`)).json()) as { data: Array<Record<string, unknown>>; hasMore: boolean };
    expect(res.data).toHaveLength(1);
    expect(res.hasMore).toBe(true);
    expect(res.data[0].role).toBe('assistant');
    const older = (await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/messages?limit=5&before=${res.data[0].seq}`)).json()) as { data: Array<Record<string, unknown>>; hasMore: boolean };
    expect(older.data.map((m) => m.role)).toEqual(['user']);
    expect(older.hasMore).toBe(false);
    const raw = JSON.stringify([res, older]);
    expect(raw).not.toMatch(/ENTARIS_IDENTITY/);
    expect(raw).not.toMatch(/actorSnapshot|toolsetHash/);
  });

  it('rename, archive/restore, and filter by status', async () => {
    const renamed = (await (await h.api(a, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, { title: 'Proyek Kembang' })).json()) as { data: { title: string; titleSource: string } };
    expect(renamed.data).toMatchObject({ title: 'Proyek Kembang', titleSource: 'user' });
    await h.api(a, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, { status: 'archived' });
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions')).json()) as { total: number }).total).toBe(0);
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions?status=archived')).json()) as { total: number }).total).toBe(1);
    // sesi arsip tidak menerima giliran baru
    expect((await h.stream(a, { input: 'lanjut', session_id: sessionA })).status).toBe(409);
    await h.api(a, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, { status: 'active' });
    expect((await h.api(a, 'PATCH', `/api/ai/chat/sessions/${sessionA}`, {})).status).toBe(400);
  });

  it('resume: last opened session is stored server-side and survives across "devices"', async () => {
    const second = (await (await h.api(a, 'POST', '/api/ai/chat/sessions', { title: 'Sesi kedua' })).json()) as { data: { id: string } };
    await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/messages`); // dibuka terakhir
    const last = (await (await h.api(a, 'GET', '/api/ai/chat/sessions/last')).json()) as { data: { id: string } };
    expect(last.data.id).toBe(sessionA);
    await h.api(a, 'GET', `/api/ai/chat/sessions/${second.data.id}/messages`);
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions/last')).json()) as { data: { id: string } }).data.id).toBe(second.data.id);
    expect(((await (await h.api(b, 'GET', '/api/ai/chat/sessions/last')).json()) as { data: unknown }).data).toBeNull();
  });

  it('export returns Markdown/JSON of own session only', async () => {
    const md = await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/export`);
    expect(md.headers.get('content-disposition')).toContain('.md');
    const text = await md.text();
    expect(text).toContain('# Proyek Kembang');
    expect(text).toContain('KEMBANG-77');
    const js = (await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sessionA}/export?format=json`)).json()) as { messages: unknown[] };
    expect(js.messages).toHaveLength(2);
  });

  it('chat_cari_riwayat / chat_ambil_sesi via MCP return only the actor\'s own messages', async () => {
    const mcp = (user: TestUser, name: string, args: Record<string, unknown>) =>
      callMcpTool({ baseUrl: h.base, token: h.mcp.token, signingSecret: h.mcp.signingSecret, claims: { uid: user.id, ch: 'panel' }, name, args });
    const own = await mcp(a, 'chat_cari_riwayat', { q: 'KEMBANG-77' });
    expect(own.isError).toBe(false);
    const data = (own.structured?.data as { data: Array<{ sessionId: string; snippet: string }> }).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((x) => x.sessionId === sessionA)).toBe(true);
    expect(data[0].snippet).toContain('KEMBANG-77');
    const other = await mcp(b, 'chat_cari_riwayat', { q: 'KEMBANG-77' });
    expect((other.structured?.data as { data: unknown[] }).data).toHaveLength(0);
    const read = await mcp(a, 'chat_ambil_sesi', { id: sessionA });
    expect((read.structured?.data as { total: number }).total).toBe(2);
    const stolen = await mcp(b, 'chat_ambil_sesi', { id: sessionA });
    expect(stolen.isError).toBe(true);
    expect(JSON.stringify(stolen.structured)).not.toContain('KEMBANG-77');
  });

  it('attachments: image stored + owner-only download; invalid/PDF rejected with clear messages', async () => {
    h.agent.setBehavior(() => ({ chunks: ['Lampiran diterima.'] }));
    const ok = await h.stream(a, { input: 'lihat foto ini' }, { file: { name: 'nota.png', type: 'image/png', bytes: TINY_PNG } });
    const sid = String(ok.events.find((e) => e.event === 'session')?.data.session_id);
    const last = h.agent.requests[h.agent.requests.length - 1];
    const user = last.body.messages[last.body.messages.length - 1].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(user.find((p) => p.type === 'image_url')?.image_url?.url).toMatch(/^data:image\/(png|webp);base64,/);
    const hist = (await (await h.api(a, 'GET', `/api/ai/chat/sessions/${sid}/messages`)).json()) as { data: Array<{ attachments: Array<{ id: string; fileName: string }> }> };
    const att = hist.data.find((m) => m.attachments.length)?.attachments[0];
    expect(att?.fileName).toBe('nota.png');
    expect((await h.api(a, 'GET', `/api/ai/chat/attachments/${att?.id}`)).status).toBe(200);
    expect((await h.api(b, 'GET', `/api/ai/chat/attachments/${att?.id}`)).status).toBe(404);
    const pdf = await h.stream(a, { input: 'baca' }, { file: { name: 'a.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4 test') } });
    expect(pdf.status).toBe(415);
    expect(String(pdf.json?.message)).toMatch(/gambar/);
    const fake = await h.stream(a, { input: 'baca' }, { file: { name: 'a.png', type: 'image/png', bytes: Buffer.from('bukan gambar sama sekali') } });
    expect(fake.status).toBe(415);
  });

  it('delete removes own session + attachment files and writes an audit entry; kill switch → 403 JSON', async () => {
    h.agent.setBehavior(() => ({ chunks: ['ok'] }));
    const r = await h.stream(a, { input: 'sesi untuk dihapus' }, { file: { name: 'x.png', type: 'image/png', bytes: TINY_PNG } });
    const sid = String(r.events.find((e) => e.event === 'session')?.data.session_id);
    const { prisma } = await import('../../lib/prisma');
    const att = await prisma.chatAttachment.findFirst({ where: { message: { sessionId: sid } } });
    expect(att).not.toBeNull();
    const { getFullPath } = await import('../../utils/fileStorage');
    expect(fs.existsSync(getFullPath(att!.filePath))).toBe(true);
    expect((await h.api(a, 'DELETE', `/api/ai/chat/sessions/${sid}`)).status).toBe(200);
    expect(await prisma.chatSession.count({ where: { id: sid } })).toBe(0);
    expect(await prisma.chatMessage.count({ where: { sessionId: sid } })).toBe(0);
    expect(fs.existsSync(path.resolve(getFullPath(att!.filePath)))).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { entityType: 'chat_session', entityId: sid, action: 'DELETE', userId: a.id } });
    expect(audit).not.toBeNull();

    await h.setAgentic(false);
    const off = await h.api(a, 'GET', '/api/ai/chat/sessions');
    expect(off.status).toBe(403);
    expect(((await off.json()) as { error: string }).error).toBe('agentic_disabled');
    expect((await h.stream(a, { input: 'halo' })).status).toBe(403);
    await h.setAgentic(true);
  });

  it('health: online with latency for everyone; engine URL only for admins', async () => {
    const admin = await h.createUser('Admin');
    const asStaff = (await (await h.api(a, 'GET', '/api/ai/chat/health')).json()) as Record<string, unknown>;
    expect(asStaff).toMatchObject({ configured: true, online: true, acceptsPdf: false });
    expect(asStaff.url).toBeUndefined();
    const asAdmin = (await (await h.api(admin, 'GET', '/api/ai/chat/health')).json()) as Record<string, unknown>;
    expect(asAdmin.url).toBe(h.agent.url);
  });

  it('retention: off by default; when set only ARCHIVED sessions older than the cutoff are deleted', async () => {
    const { prisma } = await import('../../lib/prisma');
    const { purgeArchivedChatSessions } = await import('../../services/chat/retention');
    const old = new Date(Date.now() - 200 * 86_400_000);
    const mk = (status: string) => prisma.chatSession.create({ data: { userId: b.id, title: `r-${status}`, status, lastMessageAt: old } });
    const [arch, act] = await Promise.all([mk('archived'), mk('active')]);
    expect(await purgeArchivedChatSessions(undefined)).toEqual({ enabled: false, deleted: 0 });
    expect(await prisma.chatSession.count({ where: { id: { in: [arch.id, act.id] } } })).toBe(2);
    expect((await purgeArchivedChatSessions(90)).deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.chatSession.count({ where: { id: arch.id } })).toBe(0);
    expect(await prisma.chatSession.count({ where: { id: act.id } })).toBe(1);
  });

  it('restore check: chat tables survive a dump/restore of the sessions (rows re-inserted keep ownership + order)', async () => {
    const { prisma } = await import('../../lib/prisma');
    const before = await prisma.chatMessage.findMany({ where: { session: { userId: a.id } }, orderBy: { seq: 'asc' } });
    expect(before.length).toBeGreaterThan(0);
    const sessions = await prisma.chatSession.findMany({ where: { userId: a.id } });
    // simulasi pemulihan: hapus lalu masukkan ulang dari salinan (JSON round trip = dump logis)
    const dump = JSON.parse(JSON.stringify({ sessions, messages: before })) as { sessions: typeof sessions; messages: typeof before };
    await prisma.chatSession.deleteMany({ where: { userId: a.id } });
    await prisma.chatSession.createMany({ data: dump.sessions.map((s) => ({ ...s, lastMessageAt: new Date(s.lastMessageAt), createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt), lastOpenedAt: s.lastOpenedAt ? new Date(s.lastOpenedAt) : null, inflightSince: null })) });
    await prisma.chatMessage.createMany({ data: dump.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt), parts: m.parts ?? undefined, actorSnapshot: m.actorSnapshot ?? undefined })) });
    const after = await prisma.chatMessage.findMany({ where: { session: { userId: a.id } }, orderBy: { seq: 'asc' } });
    expect(after.map((m) => m.id)).toEqual(before.map((m) => m.id));
    expect(((await (await h.api(a, 'GET', '/api/ai/chat/sessions')).json()) as { total: number }).total).toBeGreaterThan(0);
  });
});
