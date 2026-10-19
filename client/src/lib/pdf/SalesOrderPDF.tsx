import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfNum, pdfRp, pdfT, type PdfT } from './pdfFormat';
import {
  PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSection, PdfTable, type PdfColumn,
} from './kit';

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 9, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 32 },
  summaryBox: { marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sumLabel: { fontSize: 8.5, color: C.muted },
  sumVal: { fontSize: 8.5, fontFamily: F.bold },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 3, borderTopWidth: 0.8, borderColor: C.primary },
});

const STATUS_KEYS = ['Draft', 'Submitted', 'PartiallyDelivered', 'FullyDelivered', 'Cancelled', 'Paid', 'PartiallyPaid', 'Overdue'] as const;
const statusLabel = (t: PdfT, status: string): string =>
  (STATUS_KEYS as readonly string[]).includes(status) ? t(`status.${status as (typeof STATUS_KEYS)[number]}`) : status;
const rp = (n: unknown) => pdfRp(Math.round(Number(n) || 0));
const num = (n: unknown) => pdfNum(Number(n || 0), 3);

const itemCols = (t: PdfT): PdfColumn[] => [
  { key: 'item', label: t('salesOrder.columns.item'), width: 3 },
  { key: 'qty', label: t('common.qty'), width: 1.4, align: 'right' },
  { key: 'sent', label: t('salesOrder.columns.sent'), width: 1.3, align: 'right' },
  { key: 'rate', label: t('common.price'), width: 1.5, align: 'right' },
  { key: 'amount', label: t('common.amount'), width: 1.8, align: 'right' },
];
const doCols = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('salesOrder.columns.doNo'), width: 2.5 },
  { key: 'date', label: t('common.date'), width: 2 },
  { key: 'qty', label: t('common.qty'), width: 2, align: 'right' },
  { key: 'status', label: t('common.status'), width: 2, align: 'right' },
];
const invCols = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('salesOrder.columns.invoiceNo'), width: 2.2 },
  { key: 'date', label: t('common.date'), width: 1.6 },
  { key: 'total', label: t('common.grandTotal'), width: 2, align: 'right' },
  { key: 'rest', label: t('common.remaining'), width: 2, align: 'right' },
  { key: 'status', label: t('common.status'), width: 1.5, align: 'right' },
];

export interface SalesOrderPDFProps {
  so: any;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const SalesOrderPDF: React.FC<SalesOrderPDFProps> = ({ so, company }) => {
  const t = pdfT();
  const items: any[] = so.items ?? [];
  const dos: any[] = (so.deliveryOrders ?? []).filter((d: any) => d.status !== 'Cancelled');
  // Invoice unik dari DO yang ter-link.
  const invMap = new Map<string, any>();
  for (const d of dos) if (d.invoice) invMap.set(d.invoice.id, d.invoice);
  const invoices = [...invMap.values()];
  const ds = so.depositSummary ?? {};

  const itemRows = items.map((it) => ({
    item: it.itemName,
    qty: `${num(it.quantity)} ${it.unit ?? ''}`.trim(),
    sent: num(it.deliveredQty),
    rate: rp(it.rate),
    amount: rp(Number(it.amount ?? (Number(it.quantity) * Number(it.rate)))),
  }));
  const doRows = dos.map((d) => {
    const qty = (d.items ?? []).reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    return {
      no: d.doNumber,
      date: pdfDateShort(d.date),
      qty: `${num(qty)} ${d.items?.[0]?.unit ?? ''}`.trim(),
      status: statusLabel(t, d.status),
    };
  });
  const invRows = invoices.map((inv) => ({
    no: inv.invoiceNumber,
    date: pdfDateShort(inv.date),
    total: rp(inv.grandTotal),
    rest: rp(inv.outstanding),
    status: statusLabel(t, inv.status),
  }));

  return (
    <Document title={t('salesOrder.docTitle', { number: so.soNumber })} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title={t('salesOrder.title')}
          number={so.soNumber}
          dateLine={t('common.dateLine', { date: pdfDateShort(so.date) })}
          status={statusLabel(t, so.status)}
        />

        <PdfMetaRow>
          <PdfPartyBlock label={t('common.customer')} name={so.customer?.name} lines={[so.customer?.address]} />
          <View style={{ flex: 1 }}>
            <PdfMetaField label={t('common.date')} value={pdfDateShort(so.date)} />
            <PdfMetaField label={t('common.status')} value={statusLabel(t, so.status)} />
          </View>
        </PdfMetaRow>

        <PdfSection title={t('salesOrder.items')}>
          <PdfTable columns={itemCols(t)} rows={itemRows} repeatHeader={false} />
        </PdfSection>

        {/* Ringkasan uang muka */}
        <View style={S.summaryBox} wrap={false}>
          <View style={S.sumRow}><Text style={S.sumLabel}>{t('common.grandTotal')}</Text><Text style={S.sumVal}>{rp(ds.grandTotal ?? so.grandTotal)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>{t('salesOrder.depositReceived')}</Text><Text style={S.sumVal}>{rp(ds.received ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>{t('salesOrder.depositApplied')}</Text><Text style={S.sumVal}>{rp(ds.applied ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>{t('salesOrder.depositRemaining')}</Text><Text style={S.sumVal}>{rp(ds.depositRemaining ?? 0)}</Text></View>
          <View style={S.grandRow}>
            <Text style={[S.sumLabel, { fontFamily: F.bold, color: C.primary }]}>{t('salesOrder.outstanding')}</Text>
            <Text style={[S.sumVal, { fontSize: 10, color: C.primary }]}>{rp(ds.remaining ?? 0)}</Text>
          </View>
        </View>

        <PdfSection title={t('salesOrder.deliveries', { count: dos.length })}>
          <PdfTable columns={doCols(t)} rows={doRows} repeatHeader={false} emptyText={t('salesOrder.noDeliveries')} />
        </PdfSection>

        <PdfSection title={t('salesOrder.invoices', { count: invoices.length })}>
          <PdfTable columns={invCols(t)} rows={invRows} repeatHeader={false} emptyText={t('salesOrder.noInvoices')} />
        </PdfSection>

        <PdfFooter company={company.name} docRef={so.soNumber} />
      </Page>
    </Document>
  );
};

export default SalesOrderPDF;
