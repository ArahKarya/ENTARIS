/**
 * RBAC for transaction attachments: an attachment follows the permission matrix of the document
 * it belongs to (referenceType -> module). View needs `view`, upload/delete need `edit`.
 * Super-admin (Admin) always passes via permissionService.
 */
import type { PaymentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { PermAction } from '../constants/modules';
import { can, hasCap } from './permissionService';

export const ATTACHMENT_REF_TYPES = [
  'payment',
  'journal',
  'purchase_invoice',
  'sales_invoice',
  'sales_order',
  'delivery_order',
  'goods_receipt',
  'approval_request',
] as const;

export type AttachmentRefType = (typeof ATTACHMENT_REF_TYPES)[number];
type DocumentRefType = Exclude<AttachmentRefType, 'approval_request'>;

export function isAttachmentRefType(value: unknown): value is AttachmentRefType {
  return typeof value === 'string' && (ATTACHMENT_REF_TYPES as readonly string[]).includes(value);
}

/** Module keys (constants/modules.ts) per document type; any listed module grants the action. */
export const ATTACHMENT_MODULES: Record<DocumentRefType, Record<PermAction, string[]>> = {
  payment: { view: ['payment'], edit: ['payment'] },
  // Cash-ledger rows (Transaksi Bank/Kas) show transfer/expense journals too.
  journal: { view: ['journal', 'payment'], edit: ['journal'] },
  purchase_invoice: { view: ['purchase_invoice'], edit: ['purchase_invoice'] },
  sales_invoice: { view: ['sales_invoice'], edit: ['sales_invoice'] },
  sales_order: { view: ['sales_order'], edit: ['sales_order'] },
  delivery_order: { view: ['delivery_order'], edit: ['delivery_order'] },
  goods_receipt: { view: ['goods_receipt'], edit: ['goods_receipt'] },
};

/** Deposit payments (and their refunds) are managed from the deposit modules. */
const DEPOSIT_MODULE: Partial<Record<PaymentType, string>> = {
  CustomerDeposit: 'customer_deposit',
  CustomerRefund: 'customer_deposit',
  VendorDeposit: 'vendor_deposit',
  VendorRefund: 'vendor_deposit',
};

export interface AttachmentActor {
  userId: string;
  role: string;
}

export type AccessResult = { ok: true } | { ok: false; status: 403 | 404; error: string };

export const ACCESS_DENIED = 'Akses ditolak: Tidak memiliki izin.';
const DENIED: AccessResult = { ok: false, status: 403, error: ACCESS_DENIED };
const ALLOWED: AccessResult = { ok: true };

async function canAny(role: string, modules: readonly string[], action: PermAction): Promise<boolean> {
  for (const m of modules) {
    if (await can(role, m, action)) return true;
  }
  return false;
}

/**
 * Modules that grant `action` on attachments of `referenceType`. With a payment id, a deposit
 * payment also accepts its deposit module; without an id (batch counts) both deposit modules do.
 */
export async function attachmentModules(
  referenceType: DocumentRefType,
  referenceId: string | null,
  action: PermAction,
): Promise<string[]> {
  const base = ATTACHMENT_MODULES[referenceType][action];
  if (referenceType !== 'payment') return base;
  if (!referenceId) return [...base, 'customer_deposit', 'vendor_deposit'];
  const payment = await prisma.payment.findUnique({ where: { id: referenceId }, select: { paymentType: true } });
  const deposit = payment ? DEPOSIT_MODULE[payment.paymentType] : undefined;
  return deposit ? [...base, deposit] : base;
}

/** Approval-request attachments: the requester, approval.view_all, or (view only) approvals viewers. */
async function approvalRequestAccess(actor: AttachmentActor, referenceId: string | null, action: PermAction): Promise<AccessResult> {
  if (await hasCap(actor.role, 'approval.view_all')) return ALLOWED;
  if (action === 'view' && (await can(actor.role, 'approvals', 'view'))) return ALLOWED;
  if (!referenceId) return DENIED;
  const ar = await prisma.approvalRequest.findUnique({ where: { id: referenceId }, select: { requestedBy: true } });
  if (!ar) return { ok: false, status: 404, error: 'Pengajuan tidak ditemukan.' };
  return ar.requestedBy === actor.userId ? ALLOWED : DENIED;
}

/** Checks whether `actor` may view or edit (upload/delete) attachments of the given document. */
export async function checkAttachmentAccess(
  actor: AttachmentActor | undefined,
  referenceType: string,
  referenceId: string | null,
  action: PermAction,
): Promise<AccessResult> {
  if (!actor || !isAttachmentRefType(referenceType)) return DENIED;
  if (referenceType === 'approval_request') return approvalRequestAccess(actor, referenceId, action);
  const modules = await attachmentModules(referenceType, referenceId, action);
  return (await canAny(actor.role, modules, action)) ? ALLOWED : DENIED;
}
