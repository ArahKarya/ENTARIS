/** Data for the three sticky story sections (#bertanya, #stok, #approval). */

export type StoryChapter = {
  title: string;
  text: string;
};

export type StoryMockKey = "receivables" | "stock" | "invoice";

export type Story = {
  sectionId: string;
  sectionClassName: string;
  side: "media-right" | "media-left";
  titleId: string;
  eyebrowName: string;
  eyebrowContext: string;
  title: string;
  lede: string;
  chapters: readonly [StoryChapter, StoryChapter, StoryChapter];
  mock: StoryMockKey;
  mockLabel: string;
};

export const STORIES: readonly Story[] = [
  {
    sectionId: "bertanya",
    sectionClassName: "tacet-proto-section tacet-proto-section--framed",
    side: "media-right",
    titleId: "aira-story-keuangan",
    eyebrowName: "Keuangan",
    eyebrowContext: "Umur piutang",
    title: "Tanya data, dapat jawaban dari buku besar.",
    lede: "Tidak perlu menyusun laporan dulu. Tanyakan dalam bahasa sehari-hari, AIRA membaca data transaksi yang sama dengan modul Keuangan.",
    chapters: [
      { title: "Tanya seperti ke rekan kerja", text: "Ketik “Berapa piutang yang lewat 60 hari?” dan jawabannya datang tanpa Anda menyusun filter atau rumus." },
      { title: "AIRA mencari data yang tepat", text: "Laporan umur piutang di modul Keuangan dibaca sesuai hak akses peran Anda." },
      { title: "Jawaban yang bisa ditelusuri", text: "Ringkasan per pelanggan, konsisten dengan saldo Piutang Usaha di buku besar." },
    ],
    mock: "receivables",
    mockLabel: "Contoh tampilan AIRA menjawab pertanyaan umur piutang",
  },
  {
    sectionId: "stok",
    sectionClassName: "tacet-proto-section tacet-proto-section--darker",
    side: "media-left",
    titleId: "aira-story-inventori",
    eyebrowName: "Inventori",
    eyebrowContext: "Stok minimum",
    title: "Stok mana yang di bawah minimum?",
    lede: "AIRA membaca posisi stok dari mutasi yang sudah tercatat, lalu membandingkannya dengan batas minimum tiap barang.",
    chapters: [
      { title: "Tanyakan kondisi gudang", text: "Satu pertanyaan menggantikan beberapa laporan stok yang dibuka bergantian." },
      { title: "Dibaca dari mutasi stok", text: "Saldo dihitung dari transaksi masuk dan keluar yang sama dengan modul Inventori." },
      { title: "Daftar yang siap ditindaklanjuti", text: "Barang, stok saat ini, dan batas minimumnya, siap diputuskan tim pembelian." },
    ],
    mock: "stock",
    mockLabel: "Contoh tampilan AIRA menampilkan stok di bawah minimum",
  },
  {
    sectionId: "approval",
    sectionClassName: "tacet-proto-section",
    side: "media-right",
    titleId: "aira-story-penjualan",
    eyebrowName: "Draf & Approval",
    eyebrowContext: "Human-in-the-Loop",
    title: "AIRA menyiapkan draf & permintaan, manusia menyetujui.",
    lede: "Secara bawaan, AIRA tidak memposting sendiri. Faktur, pengajuan pembayaran, produksi, hingga buku kas dari foto nota berhenti sebagai draf yang menunggu persetujuan.",
    chapters: [
      { title: "AIRA menyusun draf dokumen", text: "Pembeli, barang, dan akun transaksi diisi dari data riil. Statusnya tetap Draf dan buku besar belum berubah." },
      { title: "Masuk antrean persetujuan", text: "Pejabat berwenang meninjau perbandingan nilai sebelum dan sesudah, lalu menyetujui atau menolak." },
      { title: "Diposting atas nama penanya", text: "Setelah disetujui, jurnal debit dan kredit terbentuk otomatis dan tercatat di jejak audit sebagai kerja AIRA." },
    ],
    mock: "invoice",
    mockLabel: "Contoh tampilan draf invoice dari AIRA yang menunggu persetujuan",
  },
];
