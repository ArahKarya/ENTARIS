// Service log data mirrored from a work order when it is closed. When the work order came
// from a vehicle service request, the request's odometer and service type are carried over,
// and the external vendor becomes the workshop (bengkel).

import { Prisma } from '@prisma/client';

type ServiceType = Prisma.GaVehicleServiceLogUncheckedCreateInput['jenisService'];

export interface ClosedWorkOrderSource {
  id: string;
  assetId: string;
  title: string | null;
  description: string | null;
  laborCost: Prisma.Decimal | number | string | null;
  externalCost: Prisma.Decimal | number | string | null;
  externalVendor: string | null;
  vehicleServiceReq: { odometer: number | null; jenisService: ServiceType } | null;
}

export function buildWorkOrderServiceLogData(
  wo: ClosedWorkOrderSource,
  closedAt: Date,
  userId: string,
): Prisma.GaVehicleServiceLogUncheckedCreateInput {
  const labor = new Prisma.Decimal(wo.laborCost ?? 0);
  const external = new Prisma.Decimal(wo.externalCost ?? 0);
  const total = labor.plus(external);
  const req = wo.vehicleServiceReq;
  return {
    assetId: wo.assetId,
    tanggal: closedAt,
    odometer: req?.odometer ?? null,
    jenisService: req?.jenisService ?? 'LAINNYA',
    deskripsi: wo.title || wo.description || 'Work Order (auto dari close WO)',
    bengkel: wo.externalVendor?.trim() || null,
    biaya: total.greaterThan(0) ? total : null,
    workOrderId: wo.id,
    source: 'WORK_ORDER',
    createdById: userId,
  };
}
