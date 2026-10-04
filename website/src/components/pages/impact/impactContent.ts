/*
 * Copy for /impact. ALL company names, logos, figures and quotes below are PLACEHOLDER data
 * (the page shows a visible "sample data" strip while IMPACT_IS_PLACEHOLDER is true). Replace
 * them with real, customer-approved material, then set the flag to false.
 */
export const IMPACT_IS_PLACEHOLDER = true;

export const INDUSTRY_ROWS = [
  ["UKM & toko retail", "Stok dan penjualan dicatat di Excel atau buku tulis.", "Stok, penjualan, dan laporan ada di satu tempat, terbarui otomatis."],
  ["Distribusi & trading", "Banyak vendor, pelanggan, dan invoice outstanding sulit dipantau.", "Piutang dan utang terlihat per pelanggan; notifikasi mengingatkan tagihan yang jatuh tempo."],
  ["Manufaktur (rice mill, pangan, pupuk)", "HPP baru diketahui di akhir bulan; konversi bahan ke produk jadi dihitung manual.", "BOM dan konversi produksi tercatat per batch; HPP terlihat real-time."],
  ["Kantor akuntan & konsultan", "Pembukuan banyak klien tersebar di file terpisah.", "Pembukuan multi-klien dikelola di satu server milik kantor sendiri."],
] as const;

export type Story = { company: string; industry: string; result: string };

export const STORIES: readonly Story[] = [
  { company: "PT Sinar Pangan", industry: "Rice mill", result: "Tutup buku bulanan dari 10 hari jadi 2 hari; HPP per batch terlihat setiap hari." },
  { company: "CV Maju Jaya Distribusi", industry: "Distribusi & trading", result: "Piutang lewat jatuh tempo turun 35% dalam 3 bulan." },
  { company: "Toko Berkah Mart", industry: "Retail", result: "Selisih stok opname turun dari 4% jadi di bawah 1%." },
  { company: "KAP Wibowo & Rekan", industry: "Kantor akuntan", result: "25 klien dikelola di satu server kantor." },
];

export type Quote = { text: string; name: string; role: string };

export const QUOTES: readonly Quote[] = [
  { text: "Dulu HPP baru ketahuan akhir bulan. Sekarang tiap pagi saya sudah tahu margin gabah kemarin.", name: "Budi Santoso", role: "Direktur, PT Sinar Pangan" },
  { text: "Saya tinggal tanya AIRA siapa yang belum bayar minggu ini, langsung keluar daftarnya.", name: "Rina Kartika", role: "Manajer Keuangan, CV Maju Jaya Distribusi" },
  { text: "Data klien tetap di server kantor kami. Itu alasan utama kami pindah.", name: "Hendra Wibowo", role: "Partner, KAP Wibowo & Rekan" },
];
