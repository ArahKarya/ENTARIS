import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes } from './ncrParts';
import { FOOTER_SPACE, NCR_PAGE } from './theme';
import { pdfDate } from './pdfFormat';

export interface GoodsReceiptPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface GoodsReceiptPDFProps {
  sttNumber: string;
  date: string;
  supplier: { name: string; address?: string | null; phone?: string | null };
  poNumber?: string | null;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: GoodsReceiptPDFItem[];
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const GoodsReceiptPDF: React.FC<GoodsReceiptPDFProps> = ({
  sttNumber, date, supplier, poNumber, nomorMobil, driverName, recipientName, notes, items, company,
}) => (
  <Document title={`Bukti Penerimaan Barang ${sttNumber}`} author={company.name}>
    <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
      <PdfHeader company={company} title="BUKTI PENERIMAAN BARANG" number={sttNumber} tone="mono" pageMeta />

      <PdfMetaRow gap={16}>
        <View style={{ flex: 1 }}>
          <PdfMetaField tone="mono" label="Tanggal Terima" value={pdfDate(date)} bold />
          <PdfPartyBlock
            tone="mono"
            label="Dari (Supplier)"
            name={supplier.name}
            lines={[supplier.address, supplier.phone && `Telp: ${supplier.phone}`, poNumber && `Ref PO: ${poNumber}`]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PdfMetaField tone="mono" label="No. Mobil" value={nomorMobil ? nomorMobil.toUpperCase() : null} bold />
          <PdfMetaField tone="mono" label="Supir (Supplier)" value={driverName} bold />
          <PdfMetaField tone="mono" label="Diterima Oleh" value={recipientName} bold />
        </View>
      </PdfMetaRow>

      <NcrItemsTable items={items} />
      <NcrNotes notes={notes} />

      <PdfSignatureBlock
        tone="mono"
        signatures={[{ label: 'PENGIRIM (SUPPLIER)' }, { label: 'SUPIR' }, { label: 'PENERIMA (KAMI)' }]}
      />

      <PdfFooter tone="mono" company={company.name} docRef={sttNumber} />
    </Page>
  </Document>
);

export default GoodsReceiptPDF;
