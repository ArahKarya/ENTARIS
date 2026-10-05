import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { redactSecrets } from '../utils/redact';

/**
 * Before-state ("oldValues") capture for the audit trail.
 *
 * A small registry maps an API route prefix (path after `/api/`) to a loader
 * that fetches the current row by id with a slim select. The audit middleware
 * runs the matching loader BEFORE the route handler so the snapshot reflects
 * the state prior to the change. Loaders must be cheap (single findUnique,
 * no line items) and failures are swallowed — auditing never blocks a request.
 */

export type SnapshotLoader = (id: string) => Promise<unknown>;

export interface SnapshotEntry {
  /** Route prefix without leading `/api/`, e.g. `sales/invoices`. */
  prefix: string;
  load: SnapshotLoader;
  /** Singleton resource (no id segment), e.g. `settings/company`. */
  singleton?: boolean;
}

export interface SnapshotTarget {
  entry: SnapshotEntry;
  id: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING = new Set(['PUT', 'PATCH', 'DELETE']);

/** Default per-loader time budget; on timeout the snapshot is skipped. */
export const SNAPSHOT_TIMEOUT_MS = 500;

const byId = (model: { findUnique: (args: any) => Promise<unknown> }, extra: object = {}): SnapshotLoader =>
  (id) => model.findUnique({ where: { id }, ...extra });

export const DEFAULT_SNAPSHOT_REGISTRY: SnapshotEntry[] = [
  { prefix: 'sales/invoices', load: byId(prisma.salesInvoice) },
  { prefix: 'purchase/invoices', load: byId(prisma.purchaseInvoice) },
  { prefix: 'payments', load: byId(prisma.payment) },
  { prefix: 'customer-deposits', load: byId(prisma.payment) },
  { prefix: 'vendor-deposits', load: byId(prisma.payment) },
  { prefix: 'journals', load: byId(prisma.journalEntry) },
  { prefix: 'purchase-orders', load: byId(prisma.purchaseOrder) },
  { prefix: 'goods-receipts', load: byId(prisma.goodsReceipt) },
  { prefix: 'delivery-orders', load: byId(prisma.deliveryOrder) },
  { prefix: 'sales-orders', load: byId(prisma.salesOrder) },
  { prefix: 'quotations', load: byId(prisma.quotation) },
  { prefix: 'parties', load: byId(prisma.party) },
  { prefix: 'inventory/items', load: byId(prisma.inventoryItem) },
  { prefix: 'coa', load: byId(prisma.account) },
  {
    prefix: 'users',
    load: byId(prisma.user, { omit: { passwordHash: true, telegramLinkCode: true } }),
  },
  {
    prefix: 'roles',
    load: byId(prisma.role, {
      include: {
        permissions: { select: { module: true, canView: true, canEdit: true } },
        capabilities: { select: { capability: true } },
      },
    }),
  },
  {
    prefix: 'settings/company',
    singleton: true,
    load: () => prisma.companySettings.findUnique({ where: { slug: 'default' } }),
  },
  { prefix: 'tax/config', load: byId(prisma.taxConfig) },
  { prefix: 'fiscal-years', load: byId(prisma.fiscalYear) },
  { prefix: 'fixed-assets', load: byId(prisma.fixedAsset) },
  { prefix: 'payment-requests', load: byId(prisma.paymentRequest, { include: { lines: true, settlementLines: true } }) },
  // Tagihan EAM: <prefix>/<id>/pay|cancel (kind in the path, upper-case as the client sends it).
  { prefix: 'payment-requests/eam/VEHICLE_TAX', load: byId(prisma.gaVehicleTax) },
  { prefix: 'payment-requests/eam/SERVICE_LOG', load: byId(prisma.gaVehicleServiceLog) },
  { prefix: 'payment-requests/eam/MATERIAL_REQUEST', load: byId(prisma.gaMaterialRequest) },
  { prefix: 'payment-request-types', load: byId(prisma.paymentRequestType) },
];

/** Strip `/api/` and the query string, return path segments. */
function apiSegments(originalUrl: string): string[] {
  const path = originalUrl.split('?')[0].replace(/^\/api\//, '');
  return path.split('/').filter(Boolean);
}

/**
 * Decide whether a request needs a before-snapshot and with which id.
 * - PUT/PATCH/DELETE on `<prefix>/<id>` or `<prefix>/<id>/<action>`
 * - POST only on `<prefix>/<id>/<action>` (cancel, submit, close, approve…)
 * - Singletons: PUT/PATCH on exactly `<prefix>`.
 * The longest matching prefix wins.
 */
export function matchSnapshotTarget(
  method: string,
  originalUrl: string,
  registry: SnapshotEntry[] = DEFAULT_SNAPSHOT_REGISTRY,
): SnapshotTarget | null {
  const m = method.toUpperCase();
  if (!MUTATING.has(m) && m !== 'POST') return null;
  const segs = apiSegments(originalUrl);

  const candidates = registry
    .filter((e) => {
      const p = e.prefix.split('/');
      return p.length <= segs.length && p.every((s, i) => s === segs[i]);
    })
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const entry = candidates[0];
  if (!entry) return null;

  const rest = segs.slice(entry.prefix.split('/').length);
  if (entry.singleton) {
    return rest.length === 0 && (m === 'PUT' || m === 'PATCH') ? { entry, id: null } : null;
  }
  const [id, action, ...more] = rest;
  if (!id || !UUID_RE.test(id) || more.length > 0) return null;
  if (m === 'POST' && !action) return null;
  return { entry, id };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Load and redact the before-state for a request. Returns null when the route
 * is not registered, the row is missing, the loader fails or times out.
 */
export async function captureBeforeSnapshot(
  method: string,
  originalUrl: string,
  registry: SnapshotEntry[] = DEFAULT_SNAPSHOT_REGISTRY,
  timeoutMs: number = SNAPSHOT_TIMEOUT_MS,
): Promise<{ id: string | null; snapshot: unknown } | null> {
  const target = matchSnapshotTarget(method, originalUrl, registry);
  if (!target) return null;
  try {
    const row = await withTimeout(Promise.resolve(target.entry.load(target.id ?? '')), timeoutMs);
    if (row === null || row === undefined) return null;
    // JSON round-trip turns Decimal/Date into plain JSON like the response body.
    const plain = JSON.parse(JSON.stringify(row));
    return { id: target.id, snapshot: redactSecrets(plain) };
  } catch (err) {
    logger.warn({ err, prefix: target.entry.prefix }, 'Audit before-snapshot failed; skipping');
    return null;
  }
}
