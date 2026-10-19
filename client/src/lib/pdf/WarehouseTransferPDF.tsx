import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Line, Polygon } from '@react-pdf/renderer';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfSignatureBlock } from './kit';
import { NcrItemsTable, NcrNotes } from './ncrParts';
import { CARBON, F, FOOTER_SPACE, NCR_PAGE } from './theme';
import { pdfDate, pdfT } from './pdfFormat';

const S = StyleSheet.create({
  routeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: CARBON.black, padding: 8, marginBottom: 12 },
  routeLabel: { fontSize: 8.5, fontFamily: F.bold, marginBottom: 2 },
  routeValue: { fontSize: 12, fontFamily: F.bold },
  routeArrow: { width: 44, height: 12, marginHorizontal: 10 },
});

export interface WarehouseTransferPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface WarehouseTransferPDFProps {
  transferNumber: string;
  date: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: WarehouseTransferPDFItem[];
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const WarehouseTransferPDF: React.FC<WarehouseTransferPDFProps> = ({
  transferNumber, date, fromWarehouseName, toWarehouseName, nomorMobil, driverName, recipientName, notes, items, company,
}) => {
  const t = pdfT();
  return (
    <Document title={t('transfer.docTitle', { number: transferNumber })} author={company.name}>
      <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
        <PdfHeader company={company} title={t('transfer.title')} number={transferNumber} tone="mono" pageMeta />

        <View style={S.routeBox} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={S.routeLabel}>{t('transfer.from')}</Text>
            <Text style={S.routeValue}>{fromWarehouseName}</Text>
          </View>
          <Svg style={S.routeArrow} viewBox="0 0 44 12">
            <Line x1="0" y1="6" x2="36" y2="6" stroke={CARBON.black} strokeWidth={1.5} />
            <Polygon points="34,0 44,6 34,12" fill={CARBON.black} />
          </Svg>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={S.routeLabel}>{t('transfer.to')}</Text>
            <Text style={[S.routeValue, { textAlign: 'right' }]}>{toWarehouseName}</Text>
          </View>
        </View>

        <PdfMetaRow gap={16}>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('common.date')} value={pdfDate(date)} bold />
            <PdfMetaField tone="mono" label={t('common.vehicleNo')} value={nomorMobil ? nomorMobil.toUpperCase() : null} bold />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('common.driver')} value={driverName} bold />
            <PdfMetaField tone="mono" label={t('transfer.recipient')} value={recipientName} bold />
          </View>
        </PdfMetaRow>

        <NcrItemsTable items={items} />
        <NcrNotes notes={notes} />

        <PdfSignatureBlock
          tone="mono"
          signatures={[
            { label: t('transfer.signatures.sender') },
            { label: t('transfer.signatures.driver') },
            { label: t('transfer.signatures.recipient') },
          ]}
        />

        <PdfFooter tone="mono" company={company.name} docRef={transferNumber} />
      </Page>
    </Document>
  );
};

export default WarehouseTransferPDF;
