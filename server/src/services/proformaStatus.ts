import Decimal from 'decimal.js';

// Status tampilan Proforma Invoice. Status tersimpan hanya Draft/Sent/Converted/Cancelled;
// "terbayar" dan "kedaluwarsa" dihitung saat dibaca supaya tidak bisa menyimpang dari data DP.

export type ProformaDisplayStatus =
  | 'Draft' | 'Sent' | 'PartiallyPaid' | 'Paid' | 'Expired' | 'Converted' | 'Cancelled';

export interface ProformaPaymentInfo {
  /** Jumlah yang ditagih: requestedAmount, atau grandTotal bila tagih penuh. */
  target: number;
  /** Total Customer Deposit aktif (Submitted) yang tertaut ke proforma ini. */
  paid: number;
  remaining: number;
  /** Persentase terbayar terhadap target, dibatasi 0-100. */
  paidPct: number;
}

export function computePaymentInfo(
  grandTotal: Decimal.Value,
  requestedAmount: Decimal.Value | null | undefined,
  paidAmounts: Decimal.Value[],
): ProformaPaymentInfo {
  const target = new Decimal(requestedAmount ?? grandTotal);
  const paid = paidAmounts.reduce<Decimal>((s, a) => s.plus(new Decimal(a)), new Decimal(0));
  const remaining = Decimal.max(target.minus(paid), 0);
  const pct = target.gt(0) ? Decimal.min(paid.div(target).times(100), 100) : new Decimal(0);
  return {
    target: target.toNumber(),
    paid: paid.toNumber(),
    remaining: remaining.toNumber(),
    paidPct: pct.toDecimalPlaces(1).toNumber(),
  };
}

export function deriveDisplayStatus(
  status: 'Draft' | 'Sent' | 'Converted' | 'Cancelled',
  validUntil: Date,
  pay: ProformaPaymentInfo,
  now: Date = new Date(),
): ProformaDisplayStatus {
  if (status === 'Cancelled' || status === 'Converted' || status === 'Draft') return status;
  // Sent: pembayaran menang atas kedaluwarsa (DP sudah masuk = tetap relevan).
  if (pay.target > 0 && pay.paid >= pay.target) return 'Paid';
  if (pay.paid > 0) return 'PartiallyPaid';
  // validUntil dianggap berlaku sampai akhir harinya.
  const endOfValid = new Date(validUntil);
  endOfValid.setUTCHours(23, 59, 59, 999);
  if (endOfValid < now) return 'Expired';
  return 'Sent';
}
