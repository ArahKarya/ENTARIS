import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { computePoTotals, poDueDate } from '../purchaseOrderCalc';
import { pdfDate, pdfMoneyAuto, pdfNum, pdfRpAuto, pdfT, type PdfT } from './pdfFormat';
import {
  PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSection, PdfSignatureBlock, PdfTable, PdfTotals,
  type PdfColumn,
} from './kit';

// Purchase Order PDF sent to the supplier:
// company header + supplier + items (estimated prices) + totals + notes/terms + signatures.

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 9, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 32 },
  tdDesc: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  para: { fontSize: 8.5, lineHeight: 1.4 },
});

type Num = number | string | null | undefined;

const toNum = (n: Num) => Number(n ?? 0) || 0;

export interface PurchaseOrderPDFItem {
  itemName: string;
  description?: string | null;
  quantity: Num;
  unit: string;
  estimatedRate: Num;
  estimatedAmount?: Num;
  discount?: Num;
  taxPct?: Num;
}

export interface PurchaseOrderPDFData {
  poNumber: string;
  date: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  totalEstimated: Num;
  /** Draft | PendingApproval | Submitted | Cancelled — non-ordered POs print a DRAF marker. */
  displayStatus?: string;
  paymentTermDays?: number | null;
  supplierQuoteRef?: string | null;
  otherCosts?: Num;
  otherCostsLabel?: string | null;
  warehouse?: { code?: string | null; name: string } | null;
  supplier?: { name: string; address?: string | null; phone?: string | null; taxId?: string | null } | null;
  user?: { fullName?: string | null } | null;
  items: PurchaseOrderPDFItem[];
}

export interface PurchaseOrderPDFProps {
  po: PurchaseOrderPDFData;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const columns = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('purchaseOrder.columns.no'), width: 0.4, align: 'center' },
  { key: 'item', label: t('purchaseOrder.columns.item'), width: 3.0 },
  { key: 'qty', label: t('common.qty'), width: 1.0, align: 'right' },
  { key: 'unit', label: t('common.unit'), width: 0.8 },
  { key: 'rate', label: t('purchaseOrder.columns.rate'), width: 1.5, align: 'right' },
  { key: 'disc', label: t('purchaseOrder.columns.discount'), width: 0.8, align: 'right' },
  { key: 'tax', label: t('purchaseOrder.columns.vat'), width: 0.8, align: 'right' },
  { key: 'amount', label: t('purchaseOrder.columns.amount'), width: 1.7, align: 'right' },
];

const MARK_KEYS = ['Draft', 'PendingApproval', 'Cancelled'] as const;
const statusMark = (t: PdfT, status: string | undefined): string | undefined =>
  status && (MARK_KEYS as readonly string[]).includes(status)
    ? t(`purchaseOrder.mark.${status as (typeof MARK_KEYS)[number]}`)
    : undefined;

const termLabel = (t: PdfT, days: number | null | undefined): string => {
  if (days == null) return '—';
  return days === 0 ? t('common.cashTerm') : t('common.dayTerm', { count: days });
};

const PurchaseOrderPDF: React.FC<PurchaseOrderPDFProps> = ({ po, company }) => {
  const t = pdfT();
  const supplier = po.supplier;
  // Recomputed from lines (same rules as the server) so legacy POs print too.
  const totals = computePoTotals(
    po.items.map((it) => ({
      quantity: toNum(it.quantity),
      estimatedRate: toNum(it.estimatedRate),
      discount: toNum(it.discount ?? 0),
      taxPct: toNum(it.taxPct ?? 0),
    })),
    toNum(po.otherCosts ?? 0),
  );
  const dueDate = poDueDate(po.date, po.paymentTermDays);
  const mark = statusMark(t, po.displayStatus);
  const pct = (n: Num | undefined) => (toNum(n ?? 0) > 0 ? pdfNum(n ?? 0, 2) : '—');

  const rows = po.items.map((it, i) => ({
    no: String(i + 1),
    item: (
      <View>
        <Text style={{ fontSize: 8.5 }}>{it.itemName}</Text>
        {it.description ? <Text style={S.tdDesc}>{it.description}</Text> : null}
      </View>
    ),
    qty: pdfNum(it.quantity, 3),
    unit: it.unit,
    rate: pdfMoneyAuto(it.estimatedRate),
    disc: pct(it.discount),
    tax: pct(it.taxPct),
    amount: pdfMoneyAuto(totals.lines[i]?.amount ?? toNum(it.estimatedAmount ?? 0)),
  }));

  const totalRows = [
    { label: t('common.subtotal'), value: pdfMoneyAuto(totals.subtotal), show: true },
    { label: t('common.discount'), value: pdfMoneyAuto(-totals.discountTotal), show: totals.discountTotal > 0 },
    { label: t('common.vat'), value: pdfMoneyAuto(totals.taxTotal), show: totals.taxTotal > 0 },
    { label: po.otherCostsLabel || t('common.otherCostsLower'), value: pdfMoneyAuto(totals.otherCosts), show: totals.otherCosts > 0 },
  ].filter((r) => r.show);

  return (
    <Document title={t('purchaseOrder.docTitle', { number: po.poNumber })} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title={t('purchaseOrder.title')}
          number={po.poNumber}
          dateLine={t('common.dateLine', { date: pdfDate(po.date) })}
          status={mark}
          statusColor={C.amberDk}
        />

        <PdfMetaRow>
          <PdfPartyBlock
            label={t('purchaseOrder.to')}
            name={supplier ? supplier.name : t('purchaseOrder.generalPo')}
            lines={
              supplier
                ? [
                    supplier.address,
                    supplier.phone && t('common.phone', { phone: supplier.phone }),
                    supplier.taxId && t('common.taxId', { taxId: supplier.taxId }),
                  ]
                : [t('purchaseOrder.anySupplier')]
            }
          />
          <View style={{ flex: 1 }}>
            <PdfMetaField label={t('purchaseOrder.expectedDelivery')} value={po.expectedDeliveryDate ? pdfDate(po.expectedDeliveryDate) : null} />
            <PdfMetaField
              label={t('purchaseOrder.paymentTerms')}
              value={`${termLabel(t, po.paymentTermDays)}${dueDate && po.paymentTermDays ? t('purchaseOrder.dueOn', { date: pdfDate(dueDate) }) : ''}`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField
              label={t('purchaseOrder.shipTo')}
              value={po.warehouse ? [po.warehouse.code, po.warehouse.name].filter(Boolean).join(' · ') : null}
            />
            <PdfMetaField label={t('purchaseOrder.supplierQuote')} value={po.supplierQuoteRef} />
          </View>
        </PdfMetaRow>

        <PdfTable columns={columns(t)} rows={rows} />

        <PdfTotals
          rows={totalRows}
          grand={{ label: t('common.grandTotal'), value: pdfRpAuto(totals.grandTotal) }}
          note={t('purchaseOrder.finalPriceNote')}
        />

        {po.notes ? (
          <PdfSection title={t('common.notes')}>
            <Text style={S.para}>{po.notes}</Text>
          </PdfSection>
        ) : null}
        {po.terms ? (
          <PdfSection title={t('common.terms')}>
            <Text style={S.para}>{po.terms}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: t('purchaseOrder.signatures.createdBy'), name: po.user?.fullName },
            { label: t('purchaseOrder.signatures.approvedBy') },
            { label: t('purchaseOrder.signatures.supplier'), name: supplier?.name },
          ]}
        />

        <PdfFooter company={company.name} docRef={po.poNumber} />
      </Page>
    </Document>
  );
};

export default PurchaseOrderPDF;
