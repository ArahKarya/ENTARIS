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
  payBox: { marginTop: 10, padding: 8, borderWidth: 1, borderColor: C.dark, borderStyle: 'solid' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 8.5, paddingVertical: 1.5 },
  payVal: { fontFamily: F.bold },
  payStrong: { fontFamily: F.bold, fontSize: 9.5 },
});

interface ProformaItem {
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

interface Proforma {
  proformaNumber: string;
  date: string;
  validUntil: string;
  status: string;
  customer: { name: string; address?: string | null; phone?: string | null };
  items: ProformaItem[];
  subtotal: number | string;
  potongan: number | string;
  biayaLain: number | string;
  labelPotongan?: string | null;
  labelBiaya?: string | null;
  grandTotal: number | string;
  requestedAmount?: number | string | null;
  paid?: number | string | null;
  customerRefNo?: string | null;
  notes?: string | null;
  terms?: string | null;
}


interface Props {
  proforma: Proforma;
  company: CompanyPDF;
}

const formatRupiah = (n: number) => pdfRp(n);

const STATUS_KEYS = ['Draft', 'Sent', 'PartiallyPaid', 'Paid', 'Expired', 'Converted', 'Cancelled'] as const;
const statusLabel = (t: PdfT, status: string): string =>
  (STATUS_KEYS as readonly string[]).includes(status) ? t(`proforma.status.${status as (typeof STATUS_KEYS)[number]}`) : status;

const statusColor = (status: string): string => {
  switch (status) {
    case 'Paid': return C.greenDk;
    case 'PartiallyPaid': return C.amberDk;
    case 'Expired': return C.redDk;
    case 'Converted': return C.greenDk;
    case 'Sent': return C.accent;
    default: return C.muted;
  }
};

const columns = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('proforma.columns.no'), width: 0.5, align: 'center' },
  { key: 'item', label: t('common.item'), width: 4 },
  { key: 'qty', label: t('common.qty'), width: 1.6, align: 'right' },
  { key: 'rate', label: t('common.price'), width: 2, align: 'right' },
  { key: 'amount', label: t('common.total'), width: 2.2, align: 'right' },
];

const ProformaInvoicePDF: React.FC<Props> = ({ proforma, company }) => {
  const t = pdfT();
  const items = (proforma.items ?? []).map((it) => ({
    ...it,
    quantity: Number(it.quantity),
    rate: Number(it.rate),
    discount: Number(it.discount),
    amount: Number(it.amount),
    taxPct: Number(it.taxPct ?? 0),
    pphPct: Number(it.pphPct ?? 0),
  }));

  const subtotal = Number(proforma.subtotal);
  const potongan = Number(proforma.potongan);
  const biayaLain = Number(proforma.biayaLain);
  const grandTotal = Number(proforma.grandTotal);
  const tagih = proforma.requestedAmount != null ? Number(proforma.requestedAmount) : grandTotal;
  const paid = Number(proforma.paid ?? 0);
  const sisa = Math.max(tagih - paid, 0);
  const bankAccounts = company.invoiceSettings?.sales?.bankAccounts || null;

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
    { label: proforma.labelPotongan ?? t('common.deduction'), value: `-${formatRupiah(potongan)}`, show: potongan > 0 },
    { label: proforma.labelBiaya ?? t('common.otherCosts'), value: formatRupiah(biayaLain), show: biayaLain !== 0 },
  ].filter((r) => r.show);

  return (
    <Document title={t('proforma.docTitle', { number: proforma.proformaNumber })} author={company.name}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title={t('proforma.title')}
          subtitle={t('proforma.subtitle')}
          number={proforma.proformaNumber}
          dateLine={t('common.dateLine', { date: pdfDateShort(proforma.date) })}
          extraLines={[t('proforma.validUntilLine', { date: pdfDateShort(proforma.validUntil) })]}
          status={statusLabel(t, proforma.status)}
          statusColor={statusColor(proforma.status)}
        />

        <PdfMetaRow>
          <PdfPartyBlock label={t('common.to')} name={proforma.customer?.name} lines={[proforma.customer?.address, proforma.customer?.phone]} />
          <View style={{ flex: 1 }}>
            <PdfMetaField label={t('proforma.number')} value={proforma.proformaNumber} bold />
            <PdfMetaField label={t('common.date')} value={pdfDateShort(proforma.date)} />
            <PdfMetaField label={t('proforma.validUntil')} value={pdfDateShort(proforma.validUntil)} />
            {proforma.customerRefNo ? <PdfMetaField label={t('proforma.customerRef')} value={proforma.customerRefNo} /> : null}
          </View>
        </PdfMetaRow>

        <PdfTable columns={columns(t)} rows={rows} />

        <PdfTotals rows={totalRows} grand={{ label: t('common.grandTotalUpper'), value: formatRupiah(grandTotal) }} />

        {tagih !== grandTotal || paid > 0 ? (
          <View style={S.payBox}>
            <View style={S.payRow}><Text>{t('proforma.billedAmount')}</Text><Text style={S.payVal}>{formatRupiah(tagih)}</Text></View>
            {paid > 0 ? <View style={S.payRow}><Text>{t('proforma.paidAmount')}</Text><Text style={S.payVal}>-{formatRupiah(paid)}</Text></View> : null}
            <View style={S.payRow}><Text style={S.payStrong}>{t('proforma.remaining')}</Text><Text style={[S.payVal, S.payStrong]}>{formatRupiah(sisa)}</Text></View>
          </View>
        ) : null}

        {bankAccounts ? (
          <PdfSection title={t('invoice.paymentInfo')}>
            <Text style={S.para}>{bankAccounts}</Text>
          </PdfSection>
        ) : null}

        {proforma.notes ? (
          <PdfSection title={t('common.notes')}>
            <Text style={S.para}>{proforma.notes}</Text>
          </PdfSection>
        ) : null}
        {proforma.terms ? (
          <PdfSection title={t('common.terms')}>
            <Text style={S.para}>{proforma.terms}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: t('proforma.regards'), name: company.name },
            { label: t('proforma.receivedBy'), name: proforma.customer?.name },
          ]}
        />

        <Text style={S.disclaimer}>{t('proforma.disclaimer')}</Text>

        <PdfFooter company={company.name} docRef={proforma.proformaNumber} />
      </Page>
    </Document>
  );
};

export default ProformaInvoicePDF;
