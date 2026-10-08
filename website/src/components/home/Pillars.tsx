import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "./HomeIcons";
import { AiraMark } from "@/components/site/AiraLogo";
import { SectionEyebrow } from "./SectionEyebrow";

/*
 * #keunggulan — positioning: an ERP that can reason, plus four supporting pillars. Every proof
 * point is a feature described in the product README (RBAC with custom roles, configurable system
 * accounts, rule-based approvals, Telegram notifications, public inquiry form + QR, EAM, PSAK
 * reports, PPN per item, tax report for SPT Masa, year-end closing, bank reconciliation, audit
 * trail, 1–3 → dozens of users, multi-warehouse, BOM/production).
 */

type Pillar = { icon: IconName; name: string; claim: string; proofs: readonly string[] };

const PILLARS: readonly Pillar[] = [
  {
    icon: "adjustments",
    name: "Arsitektur Fleksibel & Modular",
    claim: "Bebas sesuaikan sistem dengan keunikan alur bisnis Anda.",
    proofs: [
      "Tambah alur kerja dan modul kustom tanpa merombak sistem inti",
      "Hak akses granular per modul dan peran pengguna tanpa batas",
      "Aturan plafon otorisasi dan rantai persetujuan yang dapat disesuaikan",
    ],
  },
  {
    icon: "devices",
    name: "Akses Cepat di Mana Saja",
    claim: "Kendali operasional penuh langsung dari genggaman ponsel.",
    proofs: [
      "Format PWA responsif—ringan diakses di desktop, tablet, maupun HP",
      "Pantau notifikasi & setujui transaksi langsung via Telegram/WhatsApp",
      "Dukung operasional lapangan: dari cek stok hingga scan QR aset fisik",
    ],
  },
  {
    icon: "certificate",
    name: "Fondasi Finansial Standar Industri",
    claim: "Pembukuan presisi yang selalu audit-ready.",
    proofs: [
      "Double-entry otomatis, neraca & laba rugi patuh standar PSAK",
      "Kalkulasi HPP Moving Average (WAC) & PPN per baris transaksi",
      "Rekonsiliasi bank otomatis, transaksi berulang, & jejak audit lengkap",
    ],
  },
  {
    icon: "trendingUp",
    name: "Kedaulatan Data & Siap Tumbuh",
    claim: "Skalakan bisnis tanpa risiko vendor lock-in.",
    proofs: [
      "Self-hosted: 100% data transaksi tersimpan aman di server milik Anda",
      "Skalabel dari tim kecil hingga manufaktur multi-gudang dan lini produksi",
      "Fitur manufaktur lengkap: BOM, konversi bahan, rendemen, & HPP riil",
    ],
  },
];

const REASONING_PROOFS: readonly string[] = [
  "Siapkan draf transaksi & operasional dari bahasa sehari-hari",
  "Otomatis terhubung ke setiap modul baru via katalog tool dinamis",
  "Patuh penuh pada hak akses (RBAC) & persetujuan berjenjang",
];

export function PillarsSection() {
  return (
    <section id="keunggulan" className="home-pillars" aria-labelledby="keunggulan-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Sistem yang Ikut Bertumbuh dengan Bisnis Anda" />
        <h2 id="keunggulan-heading" className="home-section-title home-pillars__title">
          Bukan Sekadar ERP Pencatat Data. Ini Sistem yang Ikut Berpikir dan Bertindak.
        </h2>
        <p className="home-section-lead">
          Bangun alur kerja dan modul kustom tanpa batas. AIRA langsung mengeksekusi instruksi operasional Anda, berpijak kokoh pada sistem double-entry standar PSAK.
        </p>
      </div>
      <div className="home-pillars__grid">
        <article className="home-pillars__lead">
          <span className="home-pillars__icon home-pillars__icon--lead">
            <AiraMark size={28} negative />
          </span>
          <p className="home-pillars__kicker">KEMAMPUAN AGENTIC • AIRA</p>
          <h3 className="home-pillars__lead-title">Menjawab, menganalisis, dan mengeksekusi tugas.</h3>
          <p className="home-pillars__lead-text">
            AIRA bekerja langsung di atas data riil ENTARIS—bukan salinan atau perkiraan. Angka selalu sinkron dengan buku besar, dan setiap aksi finansial tetap berada di bawah kendali persetujuan Anda.
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
            <Icon name="arrowRight" />
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
            alt="Kemudahan akses AIRA dan Entaris dalam genggaman smartphone"
            className="home-mobile-banner__img"
            width={1200}
            height={900}
            priority
          />
        </div>
        <div className="home-mobile-banner__content">
          <span className="home-mobile-banner__badge">Mobile &amp; PWA Ready</span>
          <h3 className="home-mobile-banner__title">Kendali bisnis dan Agen AI, selalu dalam genggaman HP Anda.</h3>
          <p className="home-mobile-banner__text">
            Buka lewat peramban ponsel atau pasang langsung sebagai aplikasi (PWA). Cukup chat dengan AIRA untuk cek umur piutang, kontrol stok gudang, hingga menyetujui transaksi penting secara instan dari mana pun Anda berada.
          </p>
          <ul className="home-mobile-banner__list">
            <li>
              <Icon name="check" />
              <span><strong>Pasang instan di smartphone (PWA)</strong> tanpa unduh dari app store yang rumit</span>
            </li>
            <li>
              <Icon name="check" />
              <span><strong>Notifikasi &amp; tombol approval di Telegram</strong> untuk persetujuan cepat di ponsel</span>
            </li>
            <li>
              <Icon name="check" />
              <span><strong>Operasional lapangan</strong> dengan pemindaian QR aset &amp; stok langsung dari kamera HP</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
