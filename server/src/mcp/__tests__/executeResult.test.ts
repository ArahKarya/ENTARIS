import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  process.env.PORT = '3999';
});

import { ArgsError, buildRequest, callHandler, missingRequired, validateArgs } from '../execute';
import { formatHandlerResult, truncateData } from '../resultFormat';
import { getTool } from '../../ai/registry';

afterEach(() => vi.unstubAllGlobals());

describe('buildRequest', () => {
  it('substitutes :id path params and sends the rest as JSON body (POST)', () => {
    const r = buildRequest(getTool('payreq_pay')!, { id: 'abc-123', cashAccountId: 'c1', paymentDate: '2026-10-01' });
    expect(r).toMatchObject({ method: 'POST', path: '/api/payment-requests/abc-123/pay', query: '' });
    expect(r.body).toEqual({ cashAccountId: 'c1', paymentDate: '2026-10-01' });
  });

  it('GET: non-path args become the query string (arrays repeated, empties dropped)', () => {
    const tool = { ...getTool('coa_list')!, params: [] };
    const r = buildRequest(tool, { search: 'kas', ids: ['a', 'b'], empty: '', nil: null });
    expect(r.method).toBe('GET');
    expect(r.query).toBe('search=kas&ids=a&ids=b');
    expect(r.body).toBeUndefined();
  });

  it('encodes path values and refuses traversal / separators', () => {
    const tool = getTool('so_submit')!;
    expect(() => buildRequest(tool, { id: '..' })).toThrow(ArgsError);
    expect(() => buildRequest(tool, { id: 'a/b' })).toThrow(ArgsError);
    expect(() => buildRequest(tool, { id: 'a?x=1' })).toThrow(ArgsError);
    expect(() => buildRequest(tool, { id: { x: 1 } })).toThrow(ArgsError);
    expect(buildRequest(tool, { id: 'a:b' }).path).toBe('/api/sales-orders/a%3Ab/submit');
    expect(() => buildRequest(tool, { id: 'a b' })).toThrow(ArgsError);
  });

  it('missing path param -> clear ArgsError; missingRequired lists required body args', () => {
    expect(() => buildRequest(getTool('so_submit')!, {})).toThrow(/id/);
    expect(missingRequired(getTool('party_create')!, { name: 'X' })).toContain('partyType');
  });
});

describe('validateArgs', () => {
  it('checks enums and basic types leniently', () => {
    const t = getTool('party_create')!;
    expect(validateArgs(t, { name: 'A', partyType: 'Customer' })).toEqual([]);
    expect(validateArgs(t, { name: 'A', partyType: 'CUSTOMER' })[0]).toContain('Customer / Supplier / Both');
    expect(validateArgs(t, { name: { x: 1 }, partyType: 'Both' })[0]).toContain('name');
    const num = { ...t, params: [{ name: 'n', in: 'body' as const, type: 'number', required: false }] };
    expect(validateArgs(num, { n: '12.5' })).toEqual([]);
    expect(validateArgs(num, { n: 'abc' })).toHaveLength(1);
  });
});

describe('callHandler', () => {
  it('calls loopback with a short-lived JWT marked via=mcp for the actor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'p1' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await callHandler({
      tool: getTool('party_create')!,
      args: { name: 'PT A', partyType: 'Customer' },
      actor: { id: 'u1', role: 'Accountant' },
      tokenName: 'aira-dev',
      channel: 'whatsapp',
      clientIp: '100.64.0.9',
    });
    expect(res).toMatchObject({ status: 201, ok: true, body: { kind: 'json', data: { id: 'p1' } } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3999/api/parties');
    expect(init.headers['x-forwarded-for']).toBe('100.64.0.9');
    const bearer = init.headers.authorization.replace('Bearer ', '');
    const claims = jwt.verify(bearer, process.env.JWT_SECRET!) as any;
    expect(claims).toMatchObject({ userId: 'u1', role: 'Accountant', via: 'mcp', mcpToken: 'aira-dev', mcpChannel: 'whatsapp', mcpTool: 'party_create' });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(120);
    expect(JSON.parse(init.body)).toEqual({ name: 'PT A', partyType: 'Customer' });
  });

  it('classifies non-JSON responses without dumping bytes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(2048), { status: 200, headers: { 'content-type': 'application/pdf' } })));
    const res = await callHandler({ tool: getTool('coa_list')!, args: {}, actor: { id: 'u', role: 'Admin' }, tokenName: 't' });
    expect(res.body).toEqual({ kind: 'binary', contentType: 'application/pdf', bytes: 2048 });
    expect(formatHandlerResult(res).structured.data).toMatchObject({ notice: expect.stringContaining('application/pdf') });
  });
});

describe('formatHandlerResult', () => {
  const ok = (data: unknown, status = 200) => ({ status, ok: true, body: { kind: 'json' as const, data } });

  it('redacts secret-looking keys', () => {
    const r = formatHandlerResult(ok({ user: 'a', password: 'hunter2', nested: { token: 'zzz' } }));
    expect(r.text).not.toContain('hunter2');
    expect(r.text).not.toContain('zzz');
    expect(r.text).toContain('[REDACTED]');
  });

  it('surfaces upstream Indonesian errors faithfully as isError', () => {
    const r = formatHandlerResult({ status: 400, ok: false, body: { kind: 'json', data: { error: 'Stok tidak mencukupi untuk item X.' } } });
    expect(r).toMatchObject({ isError: true, structured: { ok: false, status: 400, error: 'Stok tidak mencukupi untuk item X.' } });
    expect(r.text).toContain('Stok tidak mencukupi');
    const f = formatHandlerResult({ status: 403, ok: false, body: { kind: 'json', data: { error: 'Akses ditolak: Tidak memiliki izin.' } } });
    expect(f.isError).toBe(true);
  });

  it('truncates big lists with a notice and adds a pagination hint', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, name: 'x'.repeat(100) }));
    const r = formatHandlerResult(ok({ data: rows, total: 500, page: 1, limit: 500 }), 5_000);
    expect(r.text.length).toBeLessThan(6_500);
    const s = r.structured as any;
    expect(s.truncated).toMatchObject({ field: 'data', total: 500 });
    expect(s.truncated.shown).toBeLessThan(500);
    expect(s.pagination).toMatchObject({ page: 1, total: 500, hasMore: false });
    const p = formatHandlerResult(ok({ data: [{ a: 1 }], total: 90, page: 2, limit: 30 })).structured as any;
    expect(p.pagination.hint).toContain('page=3');
  });

  it('truncateData handles bare arrays, strings and small payloads', () => {
    expect(truncateData([1, 2, 3], 100).truncated).toBeUndefined();
    expect((truncateData(Array.from({ length: 100 }, (_, i) => ({ i, pad: 'y'.repeat(50) })), 500).data as unknown[]).length).toBeLessThan(100);
    expect((truncateData('z'.repeat(1000), 100).data as string).length).toBe(100);
  });
});
