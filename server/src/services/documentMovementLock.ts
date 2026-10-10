/**
 * Stock movements created by a source document carry that document's journal, so
 * editing or cancelling them per row would desync stock and GL. Change the document instead.
 */
const DOCUMENT_LABELS: Record<string, { label: string; where: string }> = {
  GoodsReceipt: { label: 'STT', where: 'halaman STT' },
  DeliveryOrder: { label: 'surat jalan', where: 'halaman Surat Jalan' },
  SalesReturn: { label: 'retur penjualan', where: 'halaman Retur Penjualan' },
};

export function documentMovementLockMessage(
  referenceType: string | null | undefined,
  action: 'edit' | 'cancel',
): string | null {
  const doc = referenceType ? DOCUMENT_LABELS[referenceType] : undefined;
  if (!doc) return null;
  return action === 'edit'
    ? `Gerakan stok dari ${doc.label} tidak dapat diedit per baris. Ubah atau batalkan dokumennya dari ${doc.where}.`
    : `Gerakan stok dari ${doc.label} tidak dapat dibatalkan per baris. Batalkan dokumennya dari ${doc.where}.`;
}
