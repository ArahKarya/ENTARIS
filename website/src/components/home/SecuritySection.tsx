import { CtaLink } from "@/components/pages/CtaLink";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PolicyRows } from "@/components/pages/PolicyRows";
import { RecordSection } from "@/components/pages/RecordSection";
import { StepFlow } from "@/components/pages/StepFlow";
import { TablerIcon } from "@/components/pages/TablerIcon";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { SectionEyebrow } from "./SectionEyebrow";
import "@/components/pages/pages.css";

/*
 * #keamanan-data: data ownership, how a company starts, controls, where it runs and life after
 * go-live. This used to be its own page (/keamanan); it now lives on the Kapabilitas page and the
 * old addresses redirect here. Customer-facing wording only (no deployment jargon).
 */
const CHECK_PATHS = ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M9 12l2 2l4 -4"] as const;

const CHIPS = ["Data tetap di server Anda", "Siap pakai sejak hari pertama", "Jejak audit setiap perubahan"] as const;

const START_STEPS = [
  { label: "Langkah 1", title: "Pilih tempatnya", body: "Server di kantor Anda atau cloud milik perusahaan Anda. Keputusannya di tangan Anda." },
  { label: "Langkah 2", title: "Entaris dipasang", body: "Aplikasi dan datanya dipasang di server pilihan Anda, bukan di server kami." },
  { label: "Langkah 3", title: "Siap pakai", body: "Bagan akun, tahun fiskal, dan akun admin pertama sudah disiapkan otomatis." },
  { label: "Langkah 4", title: "Tim mulai bekerja", body: "Tambahkan pengguna, atur hak aksesnya, lalu mulai mencatat transaksi." },
] as const;

const CONTROL_ROWS = [
  {
    question: "Siapa yang bertindak?",
    title: "Akun & peran pengguna",
    body: "Setiap orang masuk dengan akunnya sendiri. Ada empat peran bawaan (Admin, Accountant, Staf Produksi, Viewer), dan Admin bisa menambah peran sesuai struktur perusahaan.",
    outcome: "Kenali dulu",
  },
  {
    question: "Boleh dilanjutkan?",
    title: "Hak akses & persetujuan",
    body: "Setiap orang hanya bisa membuka dan mengubah modul yang menjadi haknya. Dokumen penting melewati persetujuan, termasuk draf dari AIRA yang baru berlaku setelah disetujui.",
    outcome: "Tahan bila belum disetujui",
  },
  {
    question: "Apakah pembukuannya benar?",
    title: "Pembukuan otomatis & seimbang",
    body: "Invoice, pembayaran, jurnal, produksi, dan stok otomatis tercatat di buku besar sebagai jurnal debit dan kredit yang selalu seimbang.",
    outcome: "Debit = kredit",
  },
  {
    question: "Apa yang tercatat?",
    title: "Jejak audit",
    body: "Setiap penambahan, perubahan, dan penghapusan data tercatat lengkap: siapa, kapan, serta nilai sebelum dan sesudahnya.",
    outcome: "Simpan jejaknya",
  },
] as const;

const PLACEMENT_ROWS = [
  ["Server ringkas di kantor", "Toko & UKM, kantor kecil", "1–3 pengguna", "Perangkat fisik di tempat Anda"],
  ["Cloud milik perusahaan", "Tim di beberapa lokasi, akses dari mana saja", "Tumbuh sesuai kebutuhan", "Server atas nama perusahaan Anda"],
  ["Server kantor atau pabrik", "Pabrik & distribusi dengan jaringan internal", "Hingga puluhan pengguna", "Penuh, di jaringan Anda sendiri"],
] as const;

const AFTER_ENTRIES = [
  { term: "Cadangan data", detail: "Backup dan pemulihan data langsung dari menu Pengaturan" },
  { term: "Pembaruan", detail: "Versi baru dipasang tanpa kehilangan data yang sudah ada" },
  { term: "Ekspor", detail: "Laporan dan dokumen siap cetak ke PDF, daftar transaksi ke Excel" },
  { term: "Pengembangan", detail: "Modul tambahan bisa dikembangkan sesuai kebutuhan bisnis Anda" },
] as const;

export function SecuritySection() {
  return (
    <div id="keamanan-data" className="home-security">
      <header className="home-section-head">
        <SectionEyebrow name="Keamanan & Data" context="Di server Anda sendiri" />
        <h2 className="home-section-title home-security__title">Data bisnis Anda tinggal di server Anda sendiri.</h2>
        <p className="home-section-lead">
          Entaris berjalan di server milik perusahaan Anda, di kantor atau di cloud pilihan Anda. Data transaksi, laporan, dan cadangannya tetap di tangan Anda,
          bukan di tangan vendor.
        </p>
        <div className="home-security__actions">
          <CtaLink cta={{ label: "Minta demo", href: DEMO_HREF, arrow: true }} variant="primary" size="lg" />
          <CtaLink cta={{ label: "Lihat cara mulai ↓", href: "#mulai" }} variant="ghost" size="lg" />
        </div>
        <ul className="pg-chips">
          {CHIPS.map((chip) => (
            <li key={chip}>
              <TablerIcon name="circle-check" dataIcon="circle-check" paths={CHECK_PATHS} />
              {chip}
            </li>
          ))}
        </ul>
      </header>
      <StepFlow
        id="mulai"
        kicker="Cara mulai"
        title="Dari keputusan sampai tim bekerja."
        lead="Tidak perlu memindahkan data ke layanan pihak ketiga. Entaris berjalan di tempat yang Anda pilih, dan pembukuan bisa dimulai sejak hari pertama."
        caption={{ label: "Alur mulai", title: "Pilih, pasang, siap pakai, bekerja" }}
        steps={START_STEPS}
        results={{ label: "Hasilnya", items: ["Data di server Anda", "Hak akses per peran", "Laporan siap sejak hari pertama"] }}
      />
      <PolicyRows
        id="kontrol"
        title="Satu jalur kontrol, empat pertanyaan."
        lead="Aturan yang sama berlaku untuk setiap perubahan, dari siapa yang masuk sampai jejak yang tertinggal di catatan audit."
        rows={CONTROL_ROWS}
      />
      <InfoMatrix
        id="pilihan-tempat"
        kicker="Pilihan tempat"
        title="Pilih tempatnya. Entaris-nya tetap sama."
        lead="Dari UKM dengan 1–3 pengguna hingga pabrik dengan puluhan pengguna. Fitur seperti produksi, HPP, dan multi-gudang tinggal diaktifkan saat bisnis Anda membutuhkannya."
        head={["Tempat", "Cocok untuk", "Skala", "Kendali data"]}
        rows={PLACEMENT_ROWS}
        columns="minmax(11rem, 0.22fr) repeat(3, minmax(0, 0.26fr))"
        ariaLabel="Pilihan tempat menjalankan Entaris"
        note="Kapasitas nyata bergantung pada perangkat, jumlah transaksi, dan modul yang aktif. Kami bantu menakar kebutuhan Anda saat demo."
      />
      <RecordSection
        id="setelah-berjalan"
        kicker="Setelah berjalan"
        title="Setelah berjalan, Anda yang pegang kendali."
        text="Cadangan data, laporan, dan pengembangan fitur tetap dalam kendali perusahaan Anda, tanpa menunggu antrean vendor."
        cta={{ label: "Minta demo", href: DEMO_HREF }}
        entries={AFTER_ENTRIES}
      />
    </div>
  );
}
