/**
 * Name lookups for the approval detail dialog. Approval payloads store ids only (partyId,
 * production inputs/outputs itemId); resolving them here keeps the dialog independent of capped
 * client-side lists.
 */
import type { PrismaClient } from '@prisma/client';

export interface ItemLabel {
  name: string;
  unit: string;
}

export interface ApprovalLookups {
  party: { id: string; name: string } | null;
  items: Record<string, ItemLabel>;
}

type LookupDb = {
  party: Pick<PrismaClient['party'], 'findUnique'>;
  inventoryItem: Pick<PrismaClient['inventoryItem'], 'findMany'>;
};

const ITEM_ID_LISTS = ['inputs', 'outputs'] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Distinct inventory item ids referenced by production run lines (inputs / outputs). */
export function collectPayloadItemIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const ids = ITEM_ID_LISTS.flatMap((key) => {
    const rows = (payload as Record<string, unknown>)[key];
    return Array.isArray(rows) ? rows.map((r) => (r as { itemId?: unknown } | null)?.itemId) : [];
  });
  return Array.from(new Set(ids.filter(isNonEmptyString)));
}

export async function loadApprovalLookups(db: LookupDb, payload: unknown): Promise<ApprovalLookups> {
  const partyId = payload && typeof payload === 'object' ? (payload as { partyId?: unknown }).partyId : undefined;
  const itemIds = collectPayloadItemIds(payload);
  const [party, rows] = await Promise.all([
    isNonEmptyString(partyId) ? db.party.findUnique({ where: { id: partyId }, select: { id: true, name: true } }) : null,
    itemIds.length ? db.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }) : [],
  ]);
  const items = Object.fromEntries(rows.map((r) => [r.id, { name: r.name, unit: r.unit }]));
  return { party: party ? { id: party.id, name: party.name } : null, items };
}
