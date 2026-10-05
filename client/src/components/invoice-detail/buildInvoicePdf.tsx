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
