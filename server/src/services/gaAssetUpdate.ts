// Builds the Prisma update payload for PUT /ga/assets/:id.
// A field missing from the body is left untouched; an empty string or null clears a nullable field.
// This keeps the PIC / vehicle driver (and other fields) when a client sends a partial edit.

import { Prisma } from '@prisma/client';

export interface AssetUpdateInput {
  code?: string;
  name?: string;
  categoryId?: string;
  branchId?: string;
  costCenterId?: string | null;
  picUserId?: string | null;
  serialNumber?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
  status?: 'ACTIVE' | 'IN_REPAIR' | 'RETIRED' | 'LOST';
  condition?: 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN';
  location?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown> | null;
}

/** undefined = keep, '' / null = clear, otherwise the value. */
function nullableText(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v || null;
}

export function buildAssetUpdateData(input: AssetUpdateInput): Prisma.GaAssetUncheckedUpdateInput {
  return {
    code: input.code || undefined,
    name: input.name,
    categoryId: input.categoryId,
    branchId: input.branchId,
    costCenterId: nullableText(input.costCenterId),
    picUserId: nullableText(input.picUserId),
    serialNumber: nullableText(input.serialNumber),
    acquisitionDate:
      input.acquisitionDate === undefined ? undefined : input.acquisitionDate ? new Date(input.acquisitionDate) : null,
    acquisitionCost: input.acquisitionCost === undefined ? undefined : input.acquisitionCost,
    status: input.status,
    condition: input.condition,
    location: nullableText(input.location),
    notes: nullableText(input.notes),
    customFields: (input.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
  };
}
