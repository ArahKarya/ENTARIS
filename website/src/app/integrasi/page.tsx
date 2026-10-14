import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CP_HREF, CP_LABEL } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";

export const metadata: Metadata = {
  title: "Integrasi: terhubung dengan alat yang sudah Anda pakai",
  description:
    "Entaris bertukar data dengan bank, laporan pajak, Telegram, dan spreadsheet yang sudah Anda pakai, dan bisa dihubungkan ke sistem lain sesuai kebutuhan.",
};

/*
 * Only items backed by the product README are listed as "tersedia": bank statement upload
 * (CSV/Excel) with reconciliation, monthly PPN recap for SPT Masa, Excel/PDF import-export,
 * Telegram notifications and the EAM asset app. Everything else is offered "sesuai kebutuhan".
 */
const AVAILABLE_ROWS = [
  ["Bank", "Unggah mutasi rekening (CSV atau Excel)", "Mutasi dicocokkan dengan transaksi di buku; yang belum cocok ditandai."],
  ["Pajak", "Rekap PPN keluaran dan masukan bulanan", "Siap dipakai untuk pelaporan SPT Masa."],
  ["Spreadsheet", "Impor & ekspor Excel, ekspor PDF", "Saldo awal dan bagan akun bisa diimpor dari Excel; laporan dan daftar transaksi bisa diunduh kapan saja."],
  ["WhatsApp, Telegram & PWA", "Notifikasi, chat, foto nota & approval di HP", "Kirim foto nota untuk draft buku kas, tanya data operasional, pengingat jatuh tempo, dan tombol persetujuan langsung dari HP."],
  ["Aplikasi aset (EAM)", "Satu login, satu data", "Staf lapangan memakai aplikasi aset yang terhubung ke data ERP; QR aset bisa dipindai tanpa login."],
] as const;

const CUSTOM_ROWS = [
  ["Modul custom bisnis", "Operasional unik", "Modul spesifik perusahaan Anda dibangun di atas Entaris; otomatis terhubung ke buku besar dan masuk ke katalog tugas AIRA tanpa melatih AI dari awal."],
  ["e-Faktur / Coretax", "Pajak", "Faktur pajak disiapkan dari invoice penjualan."],
  ["Mesin & sensor pabrik", "Produksi", "Timbangan, PLC, atau sistem monitoring terhubung; hasil produksi dan rendemen tercatat otomatis per batch."],
  ["Sistem eksternal", "Kasir, marketplace, atau sistem internal", "Data bertukar dengan Entaris tanpa input ulang."],
] as const;

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Integrasi & Kustomisasi" }}
            lines={["Terhubung dan berkembang", "sesuai proses bisnis Anda."]}
            lead="Entaris bertukar data dengan bank, pajak, Telegram, dan spreadsheet. Saat bisnis Anda tumbuh, modul custom bisa ditambahkan sendiri."
            primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
            compact
          />
        }
      >
        <InfoMatrix
          id="tersedia"
          kicker="Sudah tersedia"
          title="Yang bisa Anda pakai sekarang."
          head={["Kategori", "Contoh", "Yang terjadi"]}
          rows={AVAILABLE_ROWS}
          columns="minmax(10rem, 0.2fr) repeat(2, minmax(0, 0.4fr))"
          ariaLabel="Integrasi yang sudah tersedia"
        />
        <InfoMatrix
          id="sesuai-kebutuhan"
          kicker="Sesuai kebutuhan"
          title="Bisa dibangun modul custom untuk bisnis Anda."
          lead="Entaris didesain modular dan fleksibel. Anda atau tim pengembang dapat membangun modul kustom sendiri yang langsung menyatu dengan buku besar dan otomatis dapat dioperasikan oleh AIRA."
          head={["Sistem / Modul", "Bidang", "Yang terjadi"]}
          rows={CUSTOM_ROWS}
          columns="minmax(10rem, 0.2fr) repeat(2, minmax(0, 0.4fr))"
          ariaLabel="Integrasi dan modul custom yang bisa dibangun sesuai kebutuhan"
          quiet
        />
        <PageCta
          lines={["Aplikasi Anda", "belum ada di daftar?"]}
          text="Ceritakan sistem yang Anda pakai; tim kami menilai cara menghubungkannya."
          primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
