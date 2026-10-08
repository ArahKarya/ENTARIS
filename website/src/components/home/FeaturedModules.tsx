"use client";

import { useRef } from "react";
import { Icon } from "./HomeIcons";

export type FeaturedModule = {
  id: string;
  number: string;
  name: string;
  category: string;
  categorySlug: string;
  color: string;
  desc: string;
  tags: readonly string[];
  flow: readonly string[];
  glImpact: string;
  roles: string;
  airaCapability: string;
};

export const FEATURED_MODULES: readonly FeaturedModule[] = [
  {
    id: "payment-request",
    number: "01",
    name: "Pengajuan Pembayaran & Reimbursement",
    category: "Keuangan",
    categorySlug: "keuangan",
    color: "#1b2b48",
    desc: "Gantikan Excel pribadi dan email: reimbursement, kas bon, pembayaran vendor, dan perjalanan dinas dengan alur persetujuan bertingkat.",
    tags: ["Reimbursement Staf", "Approval Plafon Wewenang", "Pertanggungjawaban Dana", "Jejak Audit Lengkap"],
    flow: ["Pemohon (Input)", "Atasan Langsung", "Verifikasi Keuangan", "Otorisasi Direktur", "Pencairan Kas"],
    glImpact: "Uang muka dicatat sebagai piutang sementara; saat realisasi nota diakui sebagai beban dan sisa dana dikembalikan.",
    roles: "Staf Pemohon, Manajer Departemen (Approval 1), Bagian Keuangan (Verifikasi), Direktur (Plafon Tinggi)",
    airaCapability: "Ajukan reimbursement lewat chat WhatsApp atau aplikasi, pantau status pengajuan, ingatkan jatuh tempo pertanggungjawaban dana.",
  },
  {
    id: "cash-book-receipt",
    number: "02",
    name: "Draft Buku Kas dari Foto Nota",
    category: "Keuangan",
    categorySlug: "keuangan",
    color: "#25638f",
    desc: "Kirim foto nota atau kuitansi dari ponsel. AIRA membaca isinya, lalu Entaris menentukan akun debit dan kredit dengan aturan tetap.",
    tags: ["Foto Nota via WhatsApp", "Debit/Kredit dengan Aturan Tetap", "Tandai Baris Ragu", "Tinjau Sebelum Posting"],
    flow: ["Kirim Foto Nota di HP", "AIRA Membaca Nota", "Akun Ditentukan Aturan", "Tinjau & Verifikasi", "Posting Buku Besar"],
    glImpact: "Jurnal seimbang: beban operasional di debit, kas kecil di kredit. Baris yang meragukan ditandai untuk diverifikasi manusia.",
    roles: "Staf Operasional / Lapangan (Kirim Foto), Akuntan (Tinjau & Validasi), Kasir (Posting)",
    airaCapability: "Membaca foto nota fisik, mengusulkan akun dengan skor keyakinan, dan mempelajari koreksi manusia untuk nota berikutnya.",
  },
  {
    id: "production-bom",
    number: "03",
    name: "BOM & Konversi Produksi",
    category: "Produksi",
    categorySlug: "produksi",
    color: "#34497a",
    desc: "Formula bahan baku menjadi produk jadi dan produk samping dengan perhitungan rendemen, HPP real-time, dan status draf produksi.",
    tags: ["Bill of Materials (BOM)", "Kalkulasi Rendemen", "HPP Real-time", "Draf Produksi & OEE"],
    flow: ["Rencana Produksi", "Keluarkan Bahan Baku", "Proses Konversi", "Draf Produksi", "Approval & Posting HPP"],
    glImpact: "Persediaan produk jadi dan produk samping bertambah, bahan baku berkurang. Input produksi berstatus draf hingga disetujui, mencegah kebocoran HPP.",
    roles: "PPIC (Perencanaan & Formula), Mandor/Operator (Input Draf Hasil), Akuntan Biaya (Analisis Rendemen & HPP)",
    airaCapability: "Simulasi kebutuhan bahan baku untuk target order, deteksi selisih rendemen aktual vs standar, siapkan draf produksi.",
  },
  {
    id: "sales-order",
    number: "04",
    name: "Penjualan & Penagihan (Order-to-Cash)",
    category: "Penjualan",
    categorySlug: "penjualan",
    color: "#2f6fc4",
    desc: "Dari quotation hingga faktur dan pelunasan. Surat jalan mengunci HPP, invoice menghitung PPN per baris otomatis.",
    tags: ["Quotation PDF", "Surat Jalan (DO)", "PPN per baris", "Piutang & Aging"],
    flow: ["Penawaran (Quotation)", "Sales Order (SO)", "Surat Jalan (DO)", "Sales Invoice", "Pelunasan"],
    glImpact: "Surat jalan memotong persediaan dan mencatat HPP; invoice mencatat piutang, penjualan, dan utang PPN.",
    roles: "Sales (Penawaran/SO), Logistik (Surat Jalan), Kasir/Keuangan (Invoice & Pelunasan)",
    airaCapability: "Buat draf quotation instan dari chat, pantau piutang jatuh tempo, susun draf pengingat tagihan klien.",
  },
  {
    id: "purchase-stt",
    number: "05",
    name: "Pembelian & Penerimaan (Procure-to-Pay)",
    category: "Pembelian",
    categorySlug: "pembelian",
    color: "#2e5ca8",
    desc: "Penerimaan barang tercatat dengan harga rata-rata bergerak. Faktur dicocokkan dengan PO dan penerimaan agar tidak ada kelebihan tagihan.",
    tags: ["PO Pemasok & Plafon", "Terima Barang", "Cocokkan PO, Penerimaan, Faktur", "Utang Dicatat Saat Barang Datang"],
    flow: ["Pengajuan (PR)", "Persetujuan Plafon", "PO Pemasok", "Terima Barang", "Faktur Pemasok"],
    glImpact: "Saat barang diterima, persediaan bertambah dan utang belum ditagih dicatat. Saat faktur datang, utang itu dipindah ke utang dagang.",
    roles: "Staf Operasional (Pengajuan), Manajer (Otorisasi PO), Gudang (Cek STT), Keuangan (Verifikasi Faktur)",
    airaCapability: "Bandingkan harga vendor dari riwayat masa lalu, cek kesesuaian fisik vs PO, draf faktur vendor.",
  },
  {
    id: "approval-gate",
    number: "06",
    name: "Jejak Audit & Persetujuan",
    category: "Sistem & Keamanan",
    categorySlug: "keuangan",
    color: "#3a5480",
    desc: "Antrean persetujuan terpusat dengan perbandingan nilai sebelum dan sesudah, plafon nominal, dan jejak audit yang membedakan kerja staf dan kerja AIRA.",
    tags: ["Plafon Nominal Wewenang", "Bandingkan Sebelum/Sesudah", "Jejak Kerja AIRA", "Data di Server Anda"],
    flow: ["Draf dari Staf atau AIRA", "Cek Identitas & Hak Akses", "Antrean Persetujuan", "Otorisasi Pejabat", "Jurnal Permanen"],
    glImpact: "Tidak ada perubahan pembukuan yang lolos tanpa otorisasi. Setiap entri mencatat aktor, waktu, dan kanal eksekusi.",
    roles: "Semua Pengguna (Inisiasi), Pejabat Otorisasi (Persetujuan), Auditor & Direksi (Inspeksi Jejak Audit)",
    airaCapability: "Ringkas dokumen yang menunggu persetujuan, tampilkan selisih nilai sebelum dan sesudah, ajukan permintaan persetujuan.",
  },
];

type FeaturedModulesProps = {
  onSelectModule: (m: FeaturedModule) => void;
};

export function FeaturedModules({ onSelectModule }: FeaturedModulesProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!trackRef.current) return;
    const amount = trackRef.current.clientWidth * 0.8;
    trackRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section className="featured-section" aria-labelledby="featured-heading">
      <div className="featured-header">
        <div className="featured-copy">
          <p className="featured-kicker">Modul pilihan</p>
          <h3 id="featured-heading" className="featured-title">
            Mulai dari modul yang paling mendesak
          </h3>
          <p className="featured-lead">
            Perusahaan biasanya memulai dari alur operasional utama, lalu menambahkan modul lainnya seiring pertumbuhan bisnis.
          </p>
        </div>
        <div className="featured-nav" aria-label="Navigasi kartu modul">
          <button
            type="button"
            className="featured-arrow"
            onClick={() => scroll("left")}
            aria-label="Gulir ke kiri"
          >
            <Icon name="chevronLeft" style={{ width: 18, height: 18 }} />
          </button>
          <button
            type="button"
            className="featured-arrow"
            onClick={() => scroll("right")}
            aria-label="Gulir ke kanan"
          >
            <Icon name="chevronRight" style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      <div ref={trackRef} className="featured-track" role="region" aria-label="Daftar modul pilihan">
        {FEATURED_MODULES.map((item) => (
          <article
            key={item.id}
            className="featured-card"
            style={{ "--card-accent": item.color } as React.CSSProperties}
            onClick={() => onSelectModule(item)}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectModule(item);
              }
            }}
          >
            <div className="featured-card__top">
              <span className="featured-card__pill">{item.category}</span>
            </div>

            <h4 className="featured-card__name">{item.name}</h4>
            <p className="featured-card__desc">{item.desc}</p>

            <div className="featured-card__tags">
              {item.tags.map((t) => (
                <span key={t} className="featured-tag">
                  {t}
                </span>
              ))}
            </div>

            <div className="featured-card__footer">
              <span className="featured-card__cta">
                <span>Lihat alur dan perlakuan PSAK</span>
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
