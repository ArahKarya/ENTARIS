import { describe, it, expect, vi, beforeEach } from 'vitest';

const { submitRun, genNumber } = vi.hoisted(() => ({
  submitRun: vi.fn(),
  genNumber: vi.fn().mockResolvedValue('DPR-202610-0001'),
}));
vi.mock('../productionRunSubmit', () => ({ submitProductionRunInTx: (...a: any[]) => submitRun(...a) }));
vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: (...a: any[]) => genNumber(...a) }));

import {
  summarizeDraftPayload, buildStockWarnings, createDraft, updateDraft, discardDraft,
  postDraftDirect, postDraftForApproval, markDraftPostedByApproval, returnDraftToEditable,
} from '../productionRunDraft';
import { BusinessError } from '../../utils/errors';

const BODY: any = {
  date: '2026-10-01',
  inputs: [{ itemId: 'gkp', quantity: 1000 }],
  outputs: [{ itemId: 'brs', quantity: 600 }, { itemId: 'sek', quantity: 200, unitPrice: 100, isByProduct: true }],
  costs: [], processIds: [], runMachines: [], downtimes: [], allowNegativeStock: false,
};
const NAMES = new Map([['gkp', 'GKP'], ['brs', 'Beras'], ['sek', 'Sekam']]);

/** Fake tx with an in-memory draft table honouring updateMany status guards. */
function makeTx(initial: Record<string, any> = {}) {
  const drafts = new Map<string, any>(Object.entries(initial));
  const matches = (d: any, where: any) => Object.entries(where).every(([k, v]) => d[k] === v);
  const tx: any = {
    drafts,
    inventoryItem: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'gkp', name: 'GKP', unit: 'kg', currentStock: 400 },
        { id: 'brs', name: 'Beras', unit: 'kg', currentStock: 0 },
        { id: 'sek', name: 'Sekam', unit: 'kg', currentStock: 0 },
      ]),
    },
    approvalRequest: { create: vi.fn().mockResolvedValue({ id: 'req-1' }) },
    productionRunDraft: {
      create: vi.fn(async ({ data }: any) => { const d = { id: 'd1', ...data }; drafts.set('d1', d); return d; }),
      findUnique: vi.fn(async ({ where }: any) => drafts.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => { Object.assign(drafts.get(where.id), data); return drafts.get(where.id); }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const d of drafts.values()) if (matches(d, where)) { Object.assign(d, data); count++; }
        return { count };
      }),
    },
  };
  return tx;
}
const draftRow = (over: any = {}) => ({ id: 'd1', draftNumber: 'DPR-202610-0001', status: 'Draft', createdById: 'u1', payload: BODY, ...over });

beforeEach(() => {
  submitRun.mockReset();
  submitRun.mockResolvedValue({ id: 'run-1', runNumber: 'PR-202610-0001' });
});

describe('pure helpers', () => {
  it('summarizes quantities and main output', () => {
    expect(summarizeDraftPayload(BODY, NAMES)).toMatchObject({ inputQty: 1000, outputQty: 800, mainOutput: 'Beras', inputNames: ['GKP'] });
  });
  it('warns when stock is short, aggregating per item', () => {
    const w = buildStockWarnings(
      [{ itemId: 'gkp', quantity: 300 }, { itemId: 'gkp', quantity: 300 }],
      new Map([['gkp', { name: 'GKP', unit: 'kg', currentStock: 400 }]]),
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("'GKP'");
  });
  it('no warning when enough stock', () => {
    expect(buildStockWarnings([{ itemId: 'gkp', quantity: 10 }], new Map([['gkp', { name: 'GKP', unit: 'kg', currentStock: 400 }]]))).toEqual([]);
  });
});

describe('create / update / discard', () => {
  it('creates a draft with raw payload, summary and stock warning, no run submitted', async () => {
    const tx = makeTx();
    const r = await createDraft(tx, BODY, { raw: true }, 'u1');
    expect(r.draft.status).toBe('Draft');
    expect(r.draft.draftNumber).toBe('DPR-202610-0001');
    expect(r.draft.payload).toEqual({ raw: true });
    expect(r.warnings).toHaveLength(1);
    expect(submitRun).not.toHaveBeenCalled();
  });
  it('skips warnings when allowNegativeStock', async () => {
    const r = await createDraft(makeTx(), { ...BODY, allowNegativeStock: true }, BODY, 'u1');
    expect(r.warnings).toEqual([]);
  });
  it('updates only while Draft', async () => {
    await expect(updateDraft(makeTx({ d1: draftRow() }), 'd1', BODY, BODY, 'u1')).resolves.toBeTruthy();
    await expect(updateDraft(makeTx({ d1: draftRow({ status: 'Posted' }) }), 'd1', BODY, BODY, 'u1')).rejects.toBeInstanceOf(BusinessError);
  });
  it('discards only Draft', async () => {
    const tx = makeTx({ d1: draftRow() });
    await discardDraft(tx, 'd1', 'u1');
    expect(tx.drafts.get('d1').status).toBe('Discarded');
    await expect(discardDraft(tx, 'd1', 'u1')).rejects.toBeInstanceOf(BusinessError);
    await expect(discardDraft(makeTx({ d1: draftRow({ status: 'PendingApproval' }) }), 'd1', 'u1')).rejects.toBeInstanceOf(BusinessError);
  });
});

describe('posting', () => {
  it('bypass: claims, submits the run, records run id', async () => {
    const tx = makeTx({ d1: draftRow() });
    const run = await postDraftDirect(tx, 'd1', 'admin');
    expect(run.id).toBe('run-1');
    expect(submitRun).toHaveBeenCalledTimes(1);
    expect(tx.drafts.get('d1')).toMatchObject({ status: 'Posted', postedRunId: 'run-1', postedRunNumber: 'PR-202610-0001', postedById: 'admin' });
  });
  it('double post: second claim is refused and submits nothing', async () => {
    const tx = makeTx({ d1: draftRow() });
    await postDraftDirect(tx, 'd1', 'admin');
    await expect(postDraftDirect(tx, 'd1', 'admin')).rejects.toBeInstanceOf(BusinessError);
    expect(submitRun).toHaveBeenCalledTimes(1);
  });
  it('propagates submit BusinessError (route rolls the tx back)', async () => {
    submitRun.mockRejectedValue(new BusinessError('Stok tidak cukup'));
    await expect(postDraftDirect(makeTx({ d1: draftRow() }), 'd1', 'admin')).rejects.toThrow('Stok tidak cukup');
  });
  it('non-bypass: queues approval with draft payload and label, no run', async () => {
    const tx = makeTx({ d1: draftRow() });
    const { request, amount } = await postDraftForApproval(tx, 'd1', 'u1');
    expect(request.id).toBe('req-1');
    expect(amount).toBe(1000);
    expect(tx.approvalRequest.create.mock.calls[0][0].data).toMatchObject({
      documentType: 'ProductionRun', documentNumber: 'Data Produksi DPR-202610-0001', requestedBy: 'u1',
    });
    expect(tx.drafts.get('d1')).toMatchObject({ status: 'PendingApproval', approvalRequestId: 'req-1' });
    expect(submitRun).not.toHaveBeenCalled();
    await expect(postDraftForApproval(tx, 'd1', 'u1')).rejects.toBeInstanceOf(BusinessError);
  });
  it('rejects an invalid stored payload', async () => {
    await expect(postDraftForApproval(makeTx({ d1: draftRow({ payload: {} }) }), 'd1', 'u1')).rejects.toBeInstanceOf(BusinessError);
  });
});

describe('approval outcome', () => {
  it('approve marks linked draft Posted; legacy request (no draft) is a no-op', async () => {
    const tx = makeTx({ d1: draftRow({ status: 'PendingApproval', approvalRequestId: 'req-1' }) });
    expect(await markDraftPostedByApproval(tx, 'req-1', { id: 'run-9', number: 'PR-9' }, 'admin')).toBe(1);
    expect(tx.drafts.get('d1')).toMatchObject({ status: 'Posted', postedRunId: 'run-9' });
    expect(await markDraftPostedByApproval(tx, 'legacy-req', { id: 'r', number: 'n' }, 'admin')).toBe(0);
  });
  it('reject returns draft to Draft with note and detaches the request', async () => {
    const tx = makeTx({ d1: draftRow({ status: 'PendingApproval', approvalRequestId: 'req-1' }) });
    expect(await returnDraftToEditable(tx, 'req-1', 'Data keliru')).toBe(true);
    expect(tx.drafts.get('d1')).toMatchObject({ status: 'Draft', approvalRequestId: null, lastError: 'Ditolak: Data keliru' });
    expect(await returnDraftToEditable(tx, 'req-1', 'x')).toBe(false);
  });
});
