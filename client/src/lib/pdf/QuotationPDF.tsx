import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CompanyPDF } from './useCompanyPDF';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfNum, pdfRp } from './pdfFormat';
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

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Sent: 'Terkirim',
  Accepted: 'Diterima',
  Rejected: 'Ditolak',
  Expired: 'Kadaluarsa',
  Cancelled: 'Dibatalkan',
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'Accepted': return C.greenDk;
    case 'Rejected': return C.redDk;
    case 'Expired': return C.amberDk;
    case 'Sent': return C.accent;
    default: return C.muted;
  }
};

const COLUMNS: PdfColumn[] = [
  { key: 'no', label: 'No', width: 0.5, align: 'center' },
  { key: 'item', label: 'Item', width: 4 },
  { key: 'qty', label: 'Qty', width: 1.6, align: 'right' },
  { key: 'rate', label: 'Harga', width: 2, align: 'right' },
  { key: 'amount', label: 'Total', width: 2.2, align: 'right' },
];

const QuotationPDF: React.FC<Props> = ({ quotation, company }) => {
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
    { label: 'Subtotal', value: formatRupiah(subtotal), show: true },
    { label: 'PPN', value: formatRupiah(taxAmount), show: taxAmount > 0 },
    { label: 'PPh', value: `−${formatRupiah(pphAmount)}`, show: pphAmount > 0 },
    { label: quotation.labelPotongan ?? 'Potongan', value: `−${formatRupiah(potongan)}`, show: potongan > 0 },
    { label: quotation.labelBiaya ?? 'Biaya Lain', value: formatRupiah(biayaLain), show: biayaLain !== 0 },
  ].filter((r) => r.show);

  return (
    <Document title={`Penawaran Harga ${quotation.quotationNumber}`} author={company.name}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title="PENAWARAN HARGA"
          subtitle="Bukan Faktur Resmi / Not a Tax Invoice"
          number={quotation.quotationNumber}
          dateLine={`Tanggal: ${pdfDateShort(quotation.date)}`}
          extraLines={[`Berlaku sampai: ${pdfDateShort(quotation.validUntil)}`]}
          status={STATUS_LABEL[quotation.status] ?? quotation.status}
          statusColor={statusColor(quotation.status)}
        />

        <PdfMetaRow>
          <PdfPartyBlock label="Kepada" name={quotation.customer?.name} lines={[quotation.customer?.address, quotation.customer?.phone]} />
          <View style={{ flex: 1 }}>
            <PdfMetaField label="No. Penawaran" value={quotation.quotationNumber} bold />
            <PdfMetaField label="Tanggal" value={pdfDateShort(quotation.date)} />
            <PdfMetaField label="Berlaku Sampai" value={pdfDateShort(quotation.validUntil)} />
          </View>
        </PdfMetaRow>

        <PdfTable columns={COLUMNS} rows={rows} />

        <PdfTotals rows={totalRows} grand={{ label: 'GRAND TOTAL', value: formatRupiah(grandTotal) }} />

        {quotation.notes ? (
          <PdfSection title="Catatan">
            <Text style={S.para}>{quotation.notes}</Text>
          </PdfSection>
        ) : null}
        {quotation.terms ? (
          <PdfSection title="Syarat & Ketentuan">
            <Text style={S.para}>{quotation.terms}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: 'Hormat Kami,', name: company.name },
            { label: 'Disetujui Oleh,', name: quotation.customer?.name },
          ]}
        />

        <Text style={S.disclaimer}>
          Penawaran ini berlaku sampai dengan tanggal yang tertera di atas. Harga dapat berubah sewaktu-waktu setelah masa berlaku berakhir. Untuk konfirmasi pemesanan, silakan menghubungi sales kami.
        </Text>

        <PdfFooter company={company.name} docRef={quotation.quotationNumber} />
      </Page>
    </Document>
  );
};

export default QuotationPDF;
