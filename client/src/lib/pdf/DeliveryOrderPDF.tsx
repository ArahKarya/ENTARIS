import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import { PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes, type NcrItem } from './ncrParts';
import { NCR_PAGE } from './theme';
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

// Dicetak di formulir karbon/printer matrix: TANPA footer & "Halaman x dari y" (posisi absolut di dasar A4
// jatuh ke halaman ke-2/3 pada kertas continuous-form yang lebih pendek).
const DeliveryOrderPDF: React.FC<DeliveryOrderPDFProps> = ({
  title: titleProp, doNumber, date, poRef, soNumber, customer, nomorMobil, driverName, recipientName, notes, items, company,
}) => {
  const t = pdfT();
  const title = titleProp ?? t('deliveryOrder.title');
  return (
    <Document title={`${title} ${doNumber}`} author={company.name}>
      <Page size="A4" style={NCR_PAGE} wrap>
        <PdfHeader company={company} title={title} number={doNumber} tone="mono" />

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


      </Page>
    </Document>
  );
};

export default DeliveryOrderPDF;
