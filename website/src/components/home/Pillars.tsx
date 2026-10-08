import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "./HomeIcons";
import { AiraMark } from "@/components/site/AiraLogo";
import { SectionEyebrow } from "./SectionEyebrow";

/*
 * #keunggulan: positioning: an ERP that can reason, plus four supporting pillars. Every proof
 * point is a feature described in the product README (RBAC with custom roles, configurable system
 * accounts, rule-based approvals, Telegram notifications, public inquiry form + QR, EAM, financial
 * reports, PPN per item, tax report for SPT Masa, year-end closing, bank reconciliation, audit
 * trail, 1-3 to dozens of users, multi-warehouse, BOM/production, WhatsApp and Telegram channels).
 */

type Pillar = { icon: IconName; name: string; claim: string; proofs: readonly string[] };

const PILLARS: readonly Pillar[] = [
  {
    icon: "adjustments",
    name: "Arsitektur Fleksibel & Modular",
    claim: "Bebas sesuaikan sistem dengan keunikan alur bisnis Anda.",
    proofs: [
      "Tambah alur kerja dan modul kustom tanpa merombak sistem inti",
      "Hak akses per modul, dengan peran pengguna yang bisa Anda tambah sendiri",
      "Aturan plafon otorisasi dan rantai persetujuan yang dapat disesuaikan",
    ],
  },
  {
    icon: "devices",
    name: "Akses Cepat di Mana Saja",
    claim: "Kendali operasional penuh langsung dari genggaman ponsel.",
    proofs: [
      "Bisa dipasang seperti aplikasi, ringan di desktop, tablet, maupun HP",
      "Notifikasi dan tombol persetujuan langsung di WhatsApp atau Telegram",
      "Cek stok dan pindai QR aset fisik dari lapangan",
    ],
  },
  {
    icon: "certificate",
    name: "Fondasi Finansial Standar PSAK",
    claim: "Pembukuan presisi yang selalu siap diaudit.",
    proofs: [
      "Jurnal debit dan kredit otomatis, neraca dan laba rugi sesuai PSAK",
      "HPP harga rata-rata bergerak dan PPN per baris transaksi",
      "Rekonsiliasi bank, transaksi berulang, dan jejak audit di setiap perubahan",
    ],
  },
  {
    icon: "trendingUp",
    name: "Kedaulatan Data & Siap Tumbuh",
    claim: "Tumbuh tanpa terikat pada satu vendor.",
    proofs: [
      "Data transaksi tersimpan di server milik Anda sendiri",
      "Dari tim kecil hingga pabrik dengan banyak gudang dan lini produksi",
      "Fitur manufaktur: BOM, konversi bahan, rendemen, dan HPP riil",
    ],
  },
];

const REASONING_PROOFS: readonly string[] = [
  "Siapkan draf transaksi & operasional dari bahasa sehari-hari",
  "Modul baru otomatis masuk ke katalog tugas AIRA",
  "Mengikuti hak akses peran dan persetujuan berjenjang",
];

export function PillarsSection() {
  return (
    <section id="keunggulan" className="home-pillars" aria-labelledby="keunggulan-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Sistem yang Ikut Bertumbuh dengan Bisnis Anda" />
        <h2 id="keunggulan-heading" className="home-section-title home-pillars__title">
          ERP yang mencatat, menalar, lalu menyiapkan pekerjaan berikutnya.
        </h2>
        <p className="home-section-lead">
          Tambahkan alur kerja dan modul kustom sesuai bisnis Anda. AIRA mengerjakan instruksi operasional di atas buku besar yang sama, dengan pembukuan double-entry sesuai standar PSAK.
        </p>
      </div>
      <div className="home-pillars__grid">
        <article className="home-pillars__lead">
          <span className="home-pillars__icon home-pillars__icon--lead">
            <AiraMark size={28} negative />
          </span>
          <p className="home-pillars__kicker">AIRA, agen AI Entaris</p>
          <h3 className="home-pillars__lead-title">Menjawab, menganalisis, dan mengeksekusi tugas.</h3>
          <p className="home-pillars__lead-text">
            AIRA bekerja langsung di atas data riil Entaris, tidak di atas salinan atau perkiraan. Angka selalu sinkron dengan buku besar, dan setiap aksi finansial tetap berada di bawah kendali persetujuan Anda.
          </p>
          <ul className="home-pillars__proofs home-pillars__proofs--lead">
            {REASONING_PROOFS.map((proof) => (
              <li key={proof}>
                <Icon name="check" />
                {proof}
              </li>
            ))}
          </ul>
          <Link href="/aira" className="home-pillars__link">
            Kenali AIRA
          </Link>
        </article>
        {PILLARS.map((pillar) => (
          <article key={pillar.name} className="home-pillars__card">
            <span className="home-pillars__icon">
              <Icon name={pillar.icon} />
            </span>
            <h3 className="home-pillars__name">{pillar.name}</h3>
            <p className="home-pillars__claim">{pillar.claim}</p>
            <ul className="home-pillars__proofs">
              {pillar.proofs.map((proof) => (
                <li key={proof}>
                  <Icon name="check" />
                  {proof}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="home-mobile-banner">
        <div className="home-mobile-banner__media">
          <Image
            src="/assets/aira-mobile-mockup.jpg"
            alt="Ilustrasi AIRA di ponsel. Nama dan angka di layar hanya contoh."
            className="home-mobile-banner__img"
            width={1200}
            height={900}
            priority
          />
          <span className="home-mobile-banner__note">Ilustrasi. Nama dan angka hanya contoh.</span>
        </div>
        <div className="home-mobile-banner__content">
          <p className="home-mobile-banner__badge">Di ponsel</p>
          <h3 className="home-mobile-banner__title">Entaris dan AIRA ikut di ponsel Anda.</h3>
          <p className="home-mobile-banner__text">
            Buka lewat peramban ponsel atau pasang sebagai aplikasi. Chat dengan AIRA untuk cek umur piutang atau stok gudang, dan setujui transaksi dari mana pun Anda berada.
          </p>
          <ul className="home-mobile-banner__list">
            <li>
              <Icon name="check" />
              <span><strong>Pasang dari peramban</strong>, tanpa unduh dari app store</span>
            </li>
            <li>
              <Icon name="check" />
              <span><strong>Notifikasi &amp; tombol persetujuan di WhatsApp atau Telegram</strong> untuk persetujuan cepat di ponsel</span>
            </li>
            <li>
              <Icon name="check" />
              <span><strong>Operasional lapangan</strong> dengan pemindaian QR aset dan stok dari kamera HP</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
