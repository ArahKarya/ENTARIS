import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildWorkOrderServiceLogData } from '../gaWorkOrderServiceLog';

const closedAt = new Date('2026-10-01T08:00:00.000Z');
const baseWo = {
  id: 'wo1',
  assetId: 'a1',
  title: 'Ganti kampas rem',
  description: null,
  laborCost: new Prisma.Decimal(150000),
  externalCost: new Prisma.Decimal(350000),
  externalVendor: '  Bengkel Maju  ',
  vehicleServiceReq: null,
};

describe('buildWorkOrderServiceLogData', () => {
  it('carries odometer and service type from the source service request', () => {
    const data = buildWorkOrderServiceLogData(
      { ...baseWo, vehicleServiceReq: { odometer: 45210, jenisService: 'PERBAIKAN' } },
      closedAt,
      'u1',
    );
    expect(data.odometer).toBe(45210);
    expect(data.jenisService).toBe('PERBAIKAN');
    expect(data.bengkel).toBe('Bengkel Maju');
    expect(Number(data.biaya)).toBe(500000);
    expect(data).toMatchObject({ assetId: 'a1', workOrderId: 'wo1', source: 'WORK_ORDER', createdById: 'u1', tanggal: closedAt });
  });

  it('falls back to LAINNYA without odometer when the WO has no service request', () => {
    const data = buildWorkOrderServiceLogData({ ...baseWo, externalVendor: null }, closedAt, 'u1');
    expect(data.odometer).toBeNull();
    expect(data.jenisService).toBe('LAINNYA');
    expect(data.bengkel).toBeNull();
  });

  it('keeps biaya null when the WO has no cost', () => {
    const data = buildWorkOrderServiceLogData({ ...baseWo, laborCost: null, externalCost: null }, closedAt, 'u1');
    expect(data.biaya).toBeNull();
  });
});
