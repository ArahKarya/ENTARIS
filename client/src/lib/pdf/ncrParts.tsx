/** Bagian bersama dokumen kertas karbon (Surat Jalan, BPB, Transfer Gudang): tabel barang, catatan, label baris. */
import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { CARBON, F } from './theme';
import { pdfNum } from './pdfFormat';
import { PdfTable, type PdfColumn } from './kit';

export interface NcrItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

const COLUMNS: PdfColumn[] = [
  { key: 'no', label: 'NO', width: 0.45, align: 'center' },
  { key: 'code', label: 'KODE', width: 1.6 },
  { key: 'name', label: 'NAMA BARANG', width: 3.4 },
  { key: 'qty', label: 'QTY', width: 1.1, align: 'right' },
  { key: 'unit', label: 'SAT', width: 0.8, align: 'center' },
  { key: 'desc', label: 'KETERANGAN', width: 2 },
];

export const NcrItemsTable: React.FC<{ items: NcrItem[] }> = ({ items }) => (
  <PdfTable
    tone="mono"
    zebra={false}
    fontSize={10}
    columns={COLUMNS}
    rows={items.map((it, i) => ({
      no: String(i + 1),
      code: it.code || '-',
      name: it.name,
      qty: <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{pdfNum(it.qty, 3)}</Text>,
      unit: it.unit,
      desc: it.description || '-',
    }))}
  />
);

const S = StyleSheet.create({
  box: { marginTop: 12, padding: 6, borderWidth: 1, borderColor: CARBON.black },
  label: { fontSize: 9, fontFamily: F.bold, marginBottom: 3 },
  text: { fontSize: 10, lineHeight: 1.4 },
});

export const NcrNotes: React.FC<{ notes?: string | null }> = ({ notes }) =>
  notes ? (
    <View style={S.box} wrap={false}>
      <Text style={S.label}>CATATAN</Text>
      <Text style={S.text}>{notes}</Text>
    </View>
  ) : null;
