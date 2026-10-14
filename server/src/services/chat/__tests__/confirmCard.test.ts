import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { chatMessage: { findFirst: m.findFirst, update: m.update } } }));

import { claimConfirmCard, parseConfirm } from '../confirmCard';

const ID = '0f8b6c1e-2d3a-4b5c-8d9e-0a1b2c3d4e5f';
const event = {
  id: ID,
  tool: 'po_submit',
  tindakan: 'persetujuan',
  konfirmasi: 'Ajukan   PO-1?',
  efek: 'Tidak ada efek GL.',
  rincian: [{ label: 'id', value: 'PO-1' }, { label: 'x', value: 5 }, 'junk'],
  expires_at: '2026-10-14T05:15:00Z',
};
const NOW = new Date('2026-10-14T05:00:00Z');

beforeEach(() => vi.clearAllMocks());

describe('parseConfirm', () => {
  it('keeps a clean, bounded card', () => {
    const card = parseConfirm(JSON.stringify(event));
    expect(card).toMatchObject({ id: ID, konfirmasi: 'Ajukan PO-1?', rincian: [{ label: 'id', value: 'PO-1' }], expiresAt: '2026-10-14T05:15:00.000Z' });
  });

  it('rejects malformed events', () => {
    expect(parseConfirm('not json')).toBeNull();
    expect(parseConfirm(JSON.stringify({ ...event, id: "x' OR 1=1" }))).toBeNull();
    expect(parseConfirm(JSON.stringify({ ...event, konfirmasi: ' ' }))).toBeNull();
    expect(parseConfirm(JSON.stringify({ ...event, expires_at: 'kapan-kapan' }))).toBeNull();
  });
});

describe('claimConfirmCard', () => {
  const stored = { id: 'msg-1', parts: { tools: [], confirm: { ...parseConfirm(JSON.stringify(event)) } } };

  it('marks an open card of this session as answered, once', async () => {
    m.findFirst.mockResolvedValueOnce(stored);
    expect(await claimConfirmCard('s1', ID, 'ya', NOW)).toBe(true);
    expect(m.findFirst.mock.calls[0][0].where).toMatchObject({ sessionId: 's1', role: 'assistant' });
    expect(m.update.mock.calls[0][0].data.parts.confirm.answered).toBe('ya');
    m.findFirst.mockResolvedValueOnce({ ...stored, parts: { confirm: { ...stored.parts.confirm, answered: 'ya' } } });
    expect(await claimConfirmCard('s1', ID, 'batal', NOW)).toBe(false);
  });

  it('refuses unknown, expired or malformed ids', async () => {
    m.findFirst.mockResolvedValueOnce(null);
    expect(await claimConfirmCard('s1', ID, 'ya', NOW)).toBe(false);
    m.findFirst.mockResolvedValueOnce(stored);
    expect(await claimConfirmCard('s1', ID, 'ya', new Date('2026-10-14T06:00:00Z'))).toBe(false);
    expect(await claimConfirmCard('s1', 'bad id!', 'ya', NOW)).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
});
