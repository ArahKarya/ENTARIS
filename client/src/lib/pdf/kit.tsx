/**
 * Primitif dokumen PDF bersama (anatomi satu-pintu):
 * PdfHeader · PdfPartyBlock · PdfTable · PdfTotals · PdfSignatureBlock · PdfFooter.
 * Dua nada: 'color' (navy Entaris, ramah cetak, tanpa fill berat) dan 'mono'
 * (hitam-putih untuk kertas karbon/NCR — hierarki lewat garis + bold).
 */
import React from 'react';
import { View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { BRAND, C, CARBON, F } from './theme';
import { pdfNow } from './pdfFormat';

Font.registerHyphenationCallback((word) => [word]);

export type PdfTone = 'color' | 'mono';

const palette = (tone: PdfTone) =>
  tone === 'mono'
    ? { ink: CARBON.black, soft: CARBON.grey, line: CARBON.black, hair: CARBON.black, head: CARBON.black, zebra: CARBON.shade }
    : { ink: C.dark, soft: C.muted, line: BRAND.navy, hair: C.border, head: BRAND.navy, zebra: C.bgLight };

export interface PdfCompany {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
}

const S = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  logo: { width: 46, height: 46, objectFit: 'contain' },
  companyName: { fontSize: 13, fontFamily: F.bold },
  companyMeta: { fontSize: 8, marginTop: 1, lineHeight: 1.25 },
  docBlock: { maxWidth: 250, alignItems: 'flex-end' },
  title: { fontSize: 16, fontFamily: F.bold, textAlign: 'right' },
  docNumber: { fontSize: 10.5, fontFamily: F.bold, textAlign: 'right', marginTop: 3 },
  docMeta: { fontSize: 8.5, textAlign: 'right', marginTop: 2 },
  status: { fontSize: 8, fontFamily: F.bold, textAlign: 'right', marginTop: 4, letterSpacing: 0.4 },
  label: { fontSize: 7.5, fontFamily: F.bold, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  partyName: { fontSize: 10, fontFamily: F.bold, marginBottom: 2 },
  partyLine: { fontSize: 9, marginBottom: 1.5, lineHeight: 1.3 },
  th: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 4 },
  thText: { fontSize: 8, fontFamily: F.bold },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, alignItems: 'flex-start' },
  td: { fontSize: 8.5, lineHeight: 1.25 },
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2.5, gap: 12 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26, gap: 14 },
  sigCol: { flex: 1, alignItems: 'center' },
  footerWrap: { position: 'absolute', bottom: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 1.5 },
  footerText: { fontSize: 7 },
});

// ─────────────────────────────── Header ───────────────────────────────

export interface PdfHeaderProps {
  company: PdfCompany;
  /** Judul dokumen, mis. "FAKTUR PENJUALAN". */
  title: string;
  /** Padanan bahasa lain / keterangan di bawah judul (opsional). */
  subtitle?: string;
  number?: string | null;
  /** Baris tanggal sudah terformat, mis. "Tanggal: 4 Oktober 2026". */
  dateLine?: string | null;
  /** Status dokumen (teks) + warna. Warna bukan satu-satunya penanda — teks selalu tampil. */
  status?: string | null;
  statusColor?: string;
  tone?: PdfTone;
  /** Baris tambahan di blok kanan (mis. periode). */
  extraLines?: string[];
  /** Default true: header berulang di setiap halaman. */
  fixed?: boolean;
  /** Cetak "Dicetak … • Halaman X dari Y" di blok kanan atas (form kontinu dot-matrix sering memotong tepi bawah). */
  pageMeta?: boolean;
}

export const PdfHeader: React.FC<PdfHeaderProps> = ({
  company, title, subtitle, number, dateLine, status, statusColor, tone = 'color', extraLines, fixed = true, pageMeta = false,
}) => {
  const p = palette(tone);
  const contact = [company.phone && `Telp: ${company.phone}`, company.email].filter(Boolean).join('  •  ');
  return (
    <View fixed={fixed}>
      <View style={S.headerRow}>
        <View style={S.companyBlock}>
          {company.logoUrl ? <Image style={S.logo} src={company.logoUrl} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[S.companyName, { color: p.head }]}>{company.name}</Text>
            {company.address ? <Text style={[S.companyMeta, { color: p.soft }]}>{company.address}</Text> : null}
            {contact ? <Text style={[S.companyMeta, { color: p.soft }]}>{contact}</Text> : null}
            {company.taxId ? <Text style={[S.companyMeta, { color: p.soft }]}>NPWP: {company.taxId}</Text> : null}
          </View>
        </View>
        <View style={S.docBlock}>
          <Text style={[S.title, { color: p.head }, title.length > 17 ? { fontSize: 13 } : {}]}>{title}</Text>
          {subtitle ? <Text style={[S.docMeta, { color: p.soft, fontFamily: F.bold }]}>{subtitle}</Text> : null}
          {number ? <Text style={[S.docNumber, { color: p.ink }]}>{number}</Text> : null}
          {dateLine ? <Text style={[S.docMeta, { color: p.ink }]}>{dateLine}</Text> : null}
          {(extraLines ?? []).map((l, i) => (
            <Text key={i} style={[S.docMeta, { color: p.soft }]}>{l}</Text>
          ))}
          {pageMeta ? (
            <Text
              style={[S.docMeta, { color: p.ink }]}
              render={({ pageNumber, totalPages }) => `Dicetak ${pdfNow()}  •  Halaman ${pageNumber} dari ${totalPages}`}
              fixed
            />
          ) : null}
          {status ? <Text style={[S.status, { color: statusColor ?? p.ink }]}>{status.toUpperCase()}</Text> : null}
        </View>
      </View>
      {tone === 'mono' ? (
        <>
          <View style={{ height: 2, backgroundColor: p.line, marginTop: 8, marginBottom: 2.5 }} />
          <View style={{ height: 0.8, backgroundColor: p.line, marginBottom: 12 }} />
        </>
      ) : (
        <View style={{ height: 1.5, backgroundColor: p.line, marginTop: 8, marginBottom: 12 }} />
      )}
    </View>
  );
};

// ─────────────────────────────── Party ────────────────────────────────

export interface PdfPartyBlockProps {
  label: string;
  name?: string | null;
  /** Baris tambahan; nilai kosong dilewati otomatis. */
  lines?: Array<string | null | undefined | false>;
  tone?: PdfTone;
  flex?: number;
}

export const PdfPartyBlock: React.FC<PdfPartyBlockProps> = ({ label, name, lines = [], tone = 'color', flex = 1 }) => {
  const p = palette(tone);
  return (
    <View style={{ flex }}>
      <Text style={[S.label, { color: p.soft }]}>{label}</Text>
      <Text style={[S.partyName, { color: p.ink }]}>{name || '-'}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={[S.partyLine, { color: p.ink }]}>{l}</Text>
      ))}
    </View>
  );
};

/** Pasangan label/nilai ringkas untuk blok meta (tanggal, termin, dst). Nilai kosong -> "-". */
export const PdfMetaField: React.FC<{ label: string; value?: string | null; tone?: PdfTone; bold?: boolean }> = ({
  label, value, tone = 'color', bold,
}) => {
  const p = palette(tone);
  return (
    <View style={{ marginBottom: 5 }}>
      <Text style={[S.label, { color: p.soft }]}>{label}</Text>
      <Text style={[S.partyLine, { color: p.ink, fontFamily: bold ? F.bold : F.regular, fontSize: bold ? 10 : 9 }]}>
        {value || '-'}
      </Text>
    </View>
  );
};

export const PdfMetaRow: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 18 }) => (
  <View style={{ flexDirection: 'row', gap, marginBottom: 12 }}>{children}</View>
);

// ─────────────────────────────── Table ────────────────────────────────

export interface PdfColumn {
  key: string;
  label: string;
  /** Lebar relatif (flex) — kolom bersifat tetap proporsional, tidak bergantung isi. */
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface PdfTableProps {
  columns: PdfColumn[];
  /** Baris: peta key -> teks, atau node (mis. nama + deskripsi). */
  rows: Array<Record<string, React.ReactNode>>;
  tone?: PdfTone;
  zebra?: boolean;
  fontSize?: number;
  /** Ulang header di tiap halaman (default true). Matikan bila satu dokumen punya >1 tabel. */
  repeatHeader?: boolean;
  /** Teks bila tidak ada baris. */
  emptyText?: string;
}

const alignOf = (a?: PdfColumn['align']) => (a === 'right' ? 'right' : a === 'center' ? 'center' : 'left');

/** Tabel: header berulang di tiap halaman, baris tidak terpotong, angka rata kanan. */
export const PdfTable: React.FC<PdfTableProps> = ({ columns, rows, tone = 'color', zebra = true, fontSize, repeatHeader = true, emptyText }) => {
  const p = palette(tone);
  const cellPad = (i: number) => (i < columns.length - 1 ? { paddingRight: 6 } : {});
  return (
    <View>
      <View
        style={[S.th, { borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line }]}
        fixed={repeatHeader}
        minPresenceAhead={44}
      >
        {columns.map((c, i) => (
          <Text key={c.key} style={[S.thText, fontSize ? { fontSize } : {}, { flex: c.width, textAlign: alignOf(c.align), color: p.head }, cellPad(i)]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 && emptyText ? (
        <Text style={{ fontSize: 8, color: p.soft, paddingVertical: 5, paddingHorizontal: 4 }}>{emptyText}</Text>
      ) : null}
      {rows.map((r, ri) => (
        <View
          key={ri}
          wrap={false}
          style={[
            S.tr,
            { borderBottomWidth: 0.5, borderColor: p.hair },
            zebra && ri % 2 === 1 ? { backgroundColor: p.zebra } : {},
          ]}
        >
          {columns.map((c, i) => {
            const v = r[c.key];
            return typeof v === 'string' || typeof v === 'number' || v == null ? (
              <Text
                key={c.key}
                style={[S.td, { flex: c.width, textAlign: alignOf(c.align), color: p.ink }, fontSize ? { fontSize } : {}, cellPad(i)]}
              >
                {v == null || v === '' ? '-' : String(v)}
              </Text>
            ) : (
              <View key={c.key} style={[{ flex: c.width }, cellPad(i)]}>{v}</View>
            );
          })}
        </View>
      ))}
      <View style={{ borderTopWidth: tone === 'mono' ? 1.5 : 1, borderColor: p.line }} />
    </View>
  );
};

// ─────────────────────────────── Totals ───────────────────────────────

export interface PdfTotalRow { label: string; value: string; }

export interface PdfTotalsProps {
  rows?: PdfTotalRow[];
  grand: PdfTotalRow;
  note?: string | null;
  width?: number;
  tone?: PdfTone;
}

export const PdfTotals: React.FC<PdfTotalsProps> = ({ rows = [], grand, note, width = 230, tone = 'color' }) => {
  const p = palette(tone);
  return (
    <View style={S.totalsWrap} wrap={false}>
      <View style={{ width }}>
        {rows.map((r) => (
          <View style={S.totalsRow} key={r.label}>
            <Text style={{ fontSize: 8.5, color: p.soft }}>{r.label}</Text>
            <Text style={{ fontSize: 8.5, color: p.ink }}>{r.value}</Text>
          </View>
        ))}
        <View style={[S.totalsRow, { borderTopWidth: 1, borderColor: p.line, paddingTop: 4, paddingBottom: 0 }]}>
          <Text style={{ fontSize: 9.5, fontFamily: F.bold, color: p.head }}>{grand.label}</Text>
          <Text style={{ fontSize: 10.5, fontFamily: F.bold, color: p.head }}>{grand.value}</Text>
        </View>
        {note ? <Text style={{ fontSize: 7.5, color: p.soft, marginTop: 3, textAlign: 'right' }}>{note}</Text> : null}
      </View>
    </View>
  );
};

// ───────────────────────────── Signatures ─────────────────────────────

export interface PdfSignature { label: string; name?: string | null; }

export const PdfSignatureBlock: React.FC<{ signatures: PdfSignature[]; tone?: PdfTone; gapAbove?: number }> = ({
  signatures, tone = 'color', gapAbove = 40,
}) => {
  const p = palette(tone);
  return (
    <View style={S.sigRow} wrap={false}>
      {signatures.map((s, i) => (
        <View style={S.sigCol} key={`${s.label}-${i}`}>
          <Text style={{ fontSize: 8.5, fontFamily: F.bold, color: p.ink, textAlign: 'center' }}>{s.label}</Text>
          <View style={{ width: '88%', borderTopWidth: 0.8, borderColor: p.ink, marginTop: gapAbove, paddingTop: 3 }}>
            <Text style={{ fontSize: 8, textAlign: 'center', color: p.ink }}>{s.name || ' '}</Text>
          </View>
        </View>
      ))}
    </View>
  );
};

/** Judul seksi dengan garis bawah halus (Catatan, Syarat & Ketentuan, dst). */
export const PdfSection: React.FC<{ title: string; children: React.ReactNode; tone?: PdfTone }> = ({ title, children, tone = 'color' }) => {
  const p = palette(tone);
  return (
    <View wrap={false} style={{ marginTop: 12 }}>
      <Text style={[S.label, { color: p.head, fontSize: 8.5, marginBottom: 3 }]}>{title}</Text>
      {children}
    </View>
  );
};

// ─────────────────────────────── Footer ───────────────────────────────

export const CONFIDENTIAL_LINE = 'Dokumen rahasia — hanya untuk pihak yang berkepentingan.';

export interface PdfFooterProps {
  company: string;
  /** Referensi dokumen (nomor/judul) di kiri-bawah. */
  docRef?: string | null;
  tone?: PdfTone;
  /** Padding horizontal halaman, supaya footer sejajar dengan isi. */
  paddingHorizontal?: number;
  /** Stempel waktu cetak (default: sekarang). */
  printedAt?: string;
}

export const PdfFooter: React.FC<PdfFooterProps> = ({
  company, docRef, tone = 'color', paddingHorizontal = 32, printedAt,
}) => {
  const p = palette(tone);
  const stamp = printedAt ?? pdfNow();
  return (
    <View fixed style={[S.footerWrap, { left: paddingHorizontal, right: paddingHorizontal }]}>
      <View style={{ height: 0.6, backgroundColor: tone === 'mono' ? CARBON.grey : p.hair }} />
      <View style={S.footerRow}>
        <Text style={[S.footerText, { color: p.soft }]}>{[company, docRef].filter(Boolean).join(' — ')}</Text>
        <Text
          style={[S.footerText, { color: p.ink, fontFamily: F.bold }]}
          render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
        />
      </View>
      <View style={S.footerRow}>
        <Text style={[S.footerText, { color: p.soft }]}>Dicetak {stamp}</Text>
        <Text style={[S.footerText, { color: p.soft }]}>{CONFIDENTIAL_LINE}</Text>
      </View>
    </View>
  );
};
