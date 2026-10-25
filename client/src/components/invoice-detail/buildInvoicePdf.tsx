/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/**
 * Builds the InvoicePDF element for InvoiceDetailDrawer. Kept as a plain
 * function (not a component) so `pdf()` / PDFDownloadLink still receive the
 * <Document> root element directly.
 */
import InvoicePDF from '../../lib/pdf/InvoicePDF';
import type { CompanyPDF } from '../../lib/pdf/useCompanyPDF';

export interface InvoicePdfArgs {
  type: 'sales' | 'purchase';
  invoice: any;
  party: any;
  items: any[];
  company: CompanyPDF;
  outstanding: number;
  paidFromCash: number;
  paidFromDeposit: number;
  partyDepositBalance: number;
  paymentBreakdown: any[];
}

/**
 * Turunan angka PDF dari payload GET detail invoice (satu sumber untuk drawer UI DAN render server).
 * Sebelumnya tersebar di InvoiceDetailDrawer; dipindah agar PDF agen identik dengan tombol PDF.
 */
export function deriveInvoicePdfArgs(
  type: 'sales' | 'purchase',
  invoice: any,
): Omit<InvoicePdfArgs, 'company'> {
  const isSales = type === 'sales';
  const party = isSales ? invoice?.customer : invoice?.supplier;
  const items: any[] = invoice?.items ?? [];
  const outstanding = Number(invoice?.outstanding ?? 0);
  const allocations: any[] = invoice?.paymentAllocations ?? [];
  const depositApplications: any[] = invoice?.depositApplications ?? [];
  // Hanya alokasi yang pembayarannya tidak dibatalkan.
  const paymentBreakdown = allocations
    .filter((a: any) => a.payment && a.payment.status !== 'Cancelled')
    .map((a: any) => ({
      paymentNumber: a.payment.paymentNumber,
      date: a.payment.date,
      amount: a.payment.amount,
      allocatedAmount: a.allocatedAmount,
      referenceNo: a.payment.referenceNo ?? null,
      notes: a.payment.notes ?? null,
      primaryAccount: a.payment.account
        ? { accountNumber: a.payment.account.accountNumber, name: a.payment.account.name, rootType: a.payment.account.rootType }
        : null,
      splits: (a.payment.splits ?? []).map((sp: any) => ({
        accountNumber: sp.account.accountNumber,
        accountName: sp.account.name,
        rootType: sp.account.rootType,
        amount: sp.amount,
        notes: sp.notes ?? null,
      })),
    }));
  const paidFromDeposit = depositApplications
    .filter((a: any) => !a.isCancelled)
    .reduce((sum: number, a: any) => sum + Number(a.appliedAmount ?? 0), 0);
  const paidFromCash = Math.max(0, Number(invoice?.grandTotal ?? 0) - outstanding - paidFromDeposit);
  const partyDepositBalance = Number((isSales ? party?.customerDepositBalance : party?.depositBalance) ?? 0);
  return { type, invoice, party, items, outstanding, paidFromCash, paidFromDeposit, partyDepositBalance, paymentBreakdown };
}

export function buildInvoicePdf({
  type,
  invoice,
  party,
  items,
  company,
  outstanding,
  paidFromCash,
  paidFromDeposit,
  partyDepositBalance,
  paymentBreakdown,
}: InvoicePdfArgs) {
  return (
    <InvoicePDF
      type={type}
      invoiceNumber={invoice.invoiceNumber}
      date={invoice.date}
      dueDate={invoice.dueDate}
      terms={invoice.terms}
      customerRefNo={invoice.customerRefNo}
      status={invoice.status}
      notes={invoice.notes}
      taxPct={invoice.taxPct ?? 0}
      potongan={invoice.potongan ?? 0}
      biayaLain={invoice.biayaLain ?? 0}
      labelPotongan={invoice.labelPotongan}
      labelBiaya={invoice.labelBiaya}
      grandTotal={invoice.grandTotal}
      outstanding={outstanding}
      paidFromCash={paidFromCash}
      paidFromDeposit={paidFromDeposit}
      partyDepositBalance={partyDepositBalance}
      party={{
        name: party?.name ?? '—',
        address: party?.address,
        phone: party?.phone,
        email: party?.email,
        taxId: party?.taxId,
      }}
      items={items.map((it: any) => ({
        itemName: it.itemName,
        quantity: it.quantity,
        unit: it.unit,
        rate: it.rate,
        discount: it.discount ?? 0,
        taxPct: it.taxPct ?? 0,
        pphPct: it.pphPct ?? 0,
        amount: it.amount,
        description: it.description,
        kualitas: it.kualitas,
        nomorMobil: it.nomorMobil,
        timbanganTruk: it.timbanganTruk,
        refaksi: it.refaksi,
        timbanganDiterima: it.timbanganDiterima,
        potonganItem: it.potonganItem,
      }))}
      company={company}
      invoiceSettings={company.invoiceSettings}
      payments={paymentBreakdown}
    />
  );
}
