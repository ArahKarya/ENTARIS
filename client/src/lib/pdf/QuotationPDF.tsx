import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CompanyPDF } from './useCompanyPDF';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfNum, pdfRp, pdfT, type PdfT } from './pdfFormat';
import {
  PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSection, PdfSignatureBlock, PdfTable, PdfTotals,
  type PdfColumn,
} from './kit';

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 9, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 32 },
  para: { fontSize: 8.5, lineHeight: 1.4 },
  disclaimer: { fontSize: 7.5, color: C.muted, lineHeight: 1.4, marginTop: 14 },
});

interface QuotationItem {
  itemName: string;
  description?: string | null;
  quantity: number | string;
  unit: string;
  rate: number | string;
  discount: number | string;
  amount: number | string;
  taxPct?: number | string;
  pphPct?: number | string;
}

interface Quotation {
  quotationNumber: string;
  date: string;
  validUntil: string;
  status: string;
  customer: { name: string; address?: string | null; phone?: string | null };
  items: QuotationItem[];
  subtotal: number | string;
  potongan: number | string;
  biayaLain: number | string;
  labelPotongan?: string | null;
  labelBiaya?: string | null;
  grandTotal: number | string;
  notes?: string | null;
  terms?: string | null;
}


interface Props {
  quotation: Quotation;
  company: CompanyPDF;
}

const formatRupiah = (n: number) => pdfRp(n);

const STATUS_KEYS = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'] as const;
const statusLabel = (t: PdfT, status: string): string =>
  (STATUS_KEYS as readonly string[]).includes(status) ? t(`quotation.status.${status as (typeof STATUS_KEYS)[number]}`) : status;

const statusColor = (status: string): string => {
  switch (status) {
    case 'Accepted': return C.greenDk;
    case 'Rejected': return C.redDk;
    case 'Expired': return C.amberDk;
    case 'Sent': return C.accent;
    default: return C.muted;
  }
};

const columns = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('quotation.columns.no'), width: 0.5, align: 'center' },
  { key: 'item', label: t('common.item'), width: 4 },
  { key: 'qty', label: t('common.qty'), width: 1.6, align: 'right' },
  { key: 'rate', label: t('common.price'), width: 2, align: 'right' },
  { key: 'amount', label: t('common.total'), width: 2.2, align: 'right' },
];

const QuotationPDF: React.FC<Props> = ({ quotation, company }) => {
  const t = pdfT();
  const items = (quotation.items ?? []).map((it) => ({
    ...it,
    quantity: Number(it.quantity),
    rate: Number(it.rate),
    discount: Number(it.discount),
    amount: Number(it.amount),
    taxPct: Number(it.taxPct ?? 0),
    pphPct: Number(it.pphPct ?? 0),
  }));

  const subtotal = Number(quotation.subtotal);
  const potongan = Number(quotation.potongan);
  const biayaLain = Number(quotation.biayaLain);
  const grandTotal = Number(quotation.grandTotal);

  const taxAmount = items.reduce((s, it) => s + it.amount * (Number(it.taxPct) / 100), 0);
  const pphAmount = items.reduce((s, it) => s + it.amount * (Number(it.pphPct) / 100), 0);

  const rows = items.map((it, i) => ({
    no: String(i + 1),
    item: (
      <View>
        <Text style={{ fontSize: 8.5 }}>{it.itemName}</Text>
        {it.description ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{it.description}</Text> : null}
      </View>
    ),
    qty: `${pdfNum(it.quantity, 3)} ${it.unit}`,
    rate: formatRupiah(it.rate),
    amount: formatRupiah(it.amount),
  }));

  const totalRows = [
    { label: t('common.subtotal'), value: formatRupiah(subtotal), show: true },
    { label: t('common.vat'), value: formatRupiah(taxAmount), show: taxAmount > 0 },
    { label: t('common.wht'), value: `-${formatRupiah(pphAmount)}`, show: pphAmount > 0 },
    { label: quotation.labelPotongan ?? t('common.deduction'), value: `-${formatRupiah(potongan)}`, show: potongan > 0 },
    { label: quotation.labelBiaya ?? t('common.otherCosts'), value: formatRupiah(biayaLain), show: biayaLain !== 0 },
  ].filter((r) => r.show);

  return (
    <Document title={t('quotation.docTitle', { number: quotation.quotationNumber })} author={company.name}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title={t('quotation.title')}
          subtitle={t('quotation.subtitle')}
          number={quotation.quotationNumber}
          dateLine={t('common.dateLine', { date: pdfDateShort(quotation.date) })}
          extraLines={[t('quotation.validUntilLine', { date: pdfDateShort(quotation.validUntil) })]}
          status={statusLabel(t, quotation.status)}
          statusColor={statusColor(quotation.status)}
        />

        <PdfMetaRow>
          <PdfPartyBlock label={t('common.to')} name={quotation.customer?.name} lines={[quotation.customer?.address, quotation.customer?.phone]} />
          <View style={{ flex: 1 }}>
            <PdfMetaField label={t('quotation.number')} value={quotation.quotationNumber} bold />
            <PdfMetaField label={t('common.date')} value={pdfDateShort(quotation.date)} />
            <PdfMetaField label={t('quotation.validUntil')} value={pdfDateShort(quotation.validUntil)} />
          </View>
        </PdfMetaRow>

        <PdfTable columns={columns(t)} rows={rows} />

        <PdfTotals rows={totalRows} grand={{ label: t('common.grandTotalUpper'), value: formatRupiah(grandTotal) }} />

        {quotation.notes ? (
          <PdfSection title={t('common.notes')}>
            <Text style={S.para}>{quotation.notes}</Text>
          </PdfSection>
        ) : null}
        {quotation.terms ? (
          <PdfSection title={t('common.terms')}>
            <Text style={S.para}>{quotation.terms}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: t('quotation.regards'), name: company.name },
            { label: t('quotation.approvedBy'), name: quotation.customer?.name },
          ]}
        />

        <Text style={S.disclaimer}>{t('quotation.disclaimer')}</Text>

        <PdfFooter company={company.name} docRef={quotation.quotationNumber} />
      </Page>
    </Document>
  );
};

export default QuotationPDF;
