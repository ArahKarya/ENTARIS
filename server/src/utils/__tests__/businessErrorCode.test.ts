import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { BusinessError, handleRouteError } from '../errors';

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('handleRouteError with BusinessError codes', () => {
  it('passes a stable code next to the message', () => {
    const res = mockRes();
    handleRouteError(res, new BusinessError('Stok tidak mencukupi.', 'GR_CANCEL_INSUFFICIENT_STOCK'), 'ctx', 'fallback');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Stok tidak mencukupi.', code: 'GR_CANCEL_INSUFFICIENT_STOCK' });
  });

  it('keeps the old shape without a code', () => {
    const res = mockRes();
    handleRouteError(res, new BusinessError('Data tidak valid.'), 'ctx', 'fallback');
    expect(res.json).toHaveBeenCalledWith({ error: 'Data tidak valid.' });
  });
});
