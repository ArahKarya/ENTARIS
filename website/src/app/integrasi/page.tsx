import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";

export const metadata: Metadata = {
  title: "Integrasi — terhubung dengan alat yang sudah Anda pakai",
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
  ["Telegram", "Notifikasi ke staf", "Pengingat jatuh tempo, stok minimum, dan persetujuan sampai ke Telegram staf."],
  ["Aplikasi aset (EAM)", "Satu login, satu data", "Staf lapangan memakai aplikasi aset yang terhubung ke data ERP; QR aset bisa dipindai tanpa login."],
] as const;

const CUSTOM_ROWS = [
  ["e-Faktur / Coretax", "Pajak", "Faktur pajak disiapkan dari invoice penjualan."],
  ["WhatsApp & email", "Komunikasi", "Invoice dan pengingat jatuh tempo terkirim langsung ke pelanggan."],
  ["Mesin & sensor pabrik", "Produksi", "Timbangan, PLC, atau sistem monitoring terhubung; hasil produksi dan rendemen tercatat otomatis per batch."],
  ["Sistem lain", "Kasir, marketplace, atau sistem internal", "Data bertukar dengan Entaris tanpa input ulang."],
] as const;

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Integrasi" }}
            lines={["Terhubung dengan alat", "yang sudah Anda pakai."]}
            lead="Entaris bertukar data dengan bank, laporan pajak, Telegram, dan spreadsheet yang sudah Anda pakai — tanpa input ulang. Semua tetap tercatat di satu buku besar."
            primary={{ label: "Minta demo", href: DEMO_HREF, arrow: true }}
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
          title="Bisa dibangun untuk bisnis Anda."
          lead="Belum standar di Entaris, tetapi bisa kami diskusikan dan dibangun sesuai proses bisnis Anda."
          head={["Sistem", "Bidang", "Yang terjadi"]}
          rows={CUSTOM_ROWS}
          columns="minmax(10rem, 0.2fr) repeat(2, minmax(0, 0.4fr))"
          ariaLabel="Integrasi yang bisa dibangun sesuai kebutuhan"
          quiet
        />
        <PageCta
          lines={["Aplikasi Anda", "belum ada di daftar?"]}
          text="Ceritakan sistem yang Anda pakai; tim kami menilai cara menghubungkannya."
          primary={{ label: "Minta demo", href: DEMO_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
