import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes } from './ncrParts';
import { FOOTER_SPACE, NCR_PAGE } from './theme';
import { pdfDate, pdfT } from './pdfFormat';

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
}) => {
  const t = pdfT();
  return (
    <Document title={t('goodsReceipt.docTitle', { number: sttNumber })} author={company.name}>
      <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
        <PdfHeader company={company} title={t('goodsReceipt.title')} number={sttNumber} tone="mono" pageMeta />

        <PdfMetaRow gap={16}>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('goodsReceipt.receivedDate')} value={pdfDate(date)} bold />
            <PdfPartyBlock
              tone="mono"
              label={t('goodsReceipt.from')}
              name={supplier.name}
              lines={[supplier.address, supplier.phone && t('common.phone', { phone: supplier.phone }), poNumber && t('goodsReceipt.poRef', { number: poNumber })]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('common.vehicleNo')} value={nomorMobil ? nomorMobil.toUpperCase() : null} bold />
            <PdfMetaField tone="mono" label={t('goodsReceipt.driver')} value={driverName} bold />
            <PdfMetaField tone="mono" label={t('goodsReceipt.receivedBy')} value={recipientName} bold />
          </View>
        </PdfMetaRow>

        <NcrItemsTable items={items} />
        <NcrNotes notes={notes} />

        <PdfSignatureBlock
          tone="mono"
          signatures={[
            { label: t('goodsReceipt.signatures.sender') },
            { label: t('goodsReceipt.signatures.driver') },
            { label: t('goodsReceipt.signatures.recipient') },
          ]}
        />

        <PdfFooter tone="mono" company={company.name} docRef={sttNumber} />
      </Page>
    </Document>
  );
};

export default GoodsReceiptPDF;
