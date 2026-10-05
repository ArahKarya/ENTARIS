import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes, type NcrItem } from './ncrParts';
import { FOOTER_SPACE, F, NCR_PAGE } from './theme';
import { pdfDate } from './pdfFormat';

export interface DeliveryOrderPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface DeliveryOrderPDFProps {
  /** Judul dokumen (default SURAT JALAN). Dipakai Surat Jalan Sementara. */
  title?: string;
  /** Catatan kaki di bawah tanda tangan (mis. dokumen sementara). */
  footnote?: string;
  doNumber: string;
  date: string;
  status: string;
  customer: { name: string; address?: string | null; phone?: string | null };
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: DeliveryOrderPDFItem[];
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
    logoUrl?: string | null;
  };
}

const DeliveryOrderPDF: React.FC<DeliveryOrderPDFProps> = ({
  title = 'SURAT JALAN', footnote, doNumber, date, customer, nomorMobil, driverName, recipientName, notes, items, company,
}) => (
  <Document title={`${title} ${doNumber}`} author={company.name}>
    <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
      <PdfHeader company={company} title={title} number={doNumber} tone="mono" pageMeta />

      <PdfMetaRow gap={16}>
        <View style={{ flex: 1 }}>
          <PdfMetaField tone="mono" label="Tanggal" value={pdfDate(date)} bold />
          <PdfPartyBlock tone="mono" label="Kepada" name={customer.name} lines={[customer.address, customer.phone && `Telp: ${customer.phone}`]} />
        </View>
        <View style={{ flex: 1 }}>
          <PdfMetaField tone="mono" label="No. Mobil" value={nomorMobil ? nomorMobil.toUpperCase() : null} bold />
          <PdfMetaField tone="mono" label="Supir" value={driverName} bold />
          <PdfMetaField tone="mono" label="Penerima" value={recipientName} bold />
        </View>
      </PdfMetaRow>

      <NcrItemsTable items={items as NcrItem[]} />
      <NcrNotes notes={notes} />

      <PdfSignatureBlock
        tone="mono"
        signatures={[
          { label: 'PENERIMA' },
          { label: 'SUPIR' },
          { label: 'VERIFIKASI FISIK (SECURITY)' },
          { label: 'PENGIRIM' },
        ]}
      />

      {footnote ? (
        <Text style={{ fontSize: 8, marginTop: 14, textAlign: 'center', fontFamily: F.bold }}>{footnote}</Text>
      ) : null}

      <PdfFooter tone="mono" company={company.name} docRef={doNumber} />
    </Page>
  </Document>
);

export default DeliveryOrderPDF;
