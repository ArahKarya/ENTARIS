import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes, type NcrItem } from './ncrParts';
import { FOOTER_SPACE, F, NCR_PAGE } from './theme';
import { pdfDate, pdfT } from './pdfFormat';

export interface DeliveryOrderPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface DeliveryOrderPDFProps {
  /** Document title (defaults to the translated delivery order title). Used by the temporary delivery note. */
  title?: string;
  /** Catatan kaki di bawah tanda tangan (mis. dokumen sementara). */
  footnote?: string;
  doNumber: string;
  date: string;
  status: string;
  /** No. PO pelanggan dari Pesanan asal (bila Surat Jalan dibuat via SO). */
  poRef?: string | null;
  /** No. Pesanan (SO) asal. */
  soNumber?: string | null;
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
  title: titleProp, footnote, doNumber, date, poRef, soNumber, customer, nomorMobil, driverName, recipientName, notes, items, company,
}) => {
  const t = pdfT();
  const title = titleProp ?? t('deliveryOrder.title');
  return (
    <Document title={`${title} ${doNumber}`} author={company.name}>
      <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
        <PdfHeader company={company} title={title} number={doNumber} tone="mono" pageMeta />

        <PdfMetaRow gap={16}>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('common.date')} value={pdfDate(date)} bold />
            <PdfPartyBlock tone="mono" label={t('common.to')} name={customer.name} lines={[customer.address, customer.phone && t('common.phone', { phone: customer.phone })]} />
          </View>
          <View style={{ flex: 1 }}>
            {poRef?.trim() ? <PdfMetaField tone="mono" label={t('deliveryOrder.poNo')} value={poRef.trim()} bold /> : null}
            {soNumber ? <PdfMetaField tone="mono" label={t('deliveryOrder.soNo')} value={soNumber} bold /> : null}
            <PdfMetaField tone="mono" label={t('common.vehicleNo')} value={nomorMobil ? nomorMobil.toUpperCase() : null} bold />
            <PdfMetaField tone="mono" label={t('common.driver')} value={driverName} bold />
            <PdfMetaField tone="mono" label={t('common.recipient')} value={recipientName} bold />
          </View>
        </PdfMetaRow>

        <NcrItemsTable items={items as NcrItem[]} />
        <NcrNotes notes={notes} />

        <PdfSignatureBlock
          tone="mono"
          signatures={[
            { label: t('deliveryOrder.signatures.recipient') },
            { label: t('deliveryOrder.signatures.driver') },
            { label: t('deliveryOrder.signatures.security') },
            { label: t('deliveryOrder.signatures.sender') },
          ]}
        />

        {footnote ? (
          <Text style={{ fontSize: 8, marginTop: 14, textAlign: 'center', fontFamily: F.bold }}>{footnote}</Text>
        ) : null}

        <PdfFooter tone="mono" company={company.name} docRef={doNumber} />
      </Page>
    </Document>
  );
};

export default DeliveryOrderPDF;
