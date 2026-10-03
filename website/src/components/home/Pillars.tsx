import Link from "next/link";
import { Icon, type IconName } from "./HomeIcons";
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
    name: "Fleksibel",
    claim: "Mengikuti cara kerja Anda, bukan sebaliknya.",
    proofs: [
      "Buat peran sendiri — Kasir, Auditor, Staf Pembelian — dengan hak akses per modul",
      "Aturan persetujuan per jenis dokumen dan batas nominal",
      "Akun sistem dipetakan sesuai kebijakan akuntansi Anda",
    ],
  },
  {
    icon: "devices",
    name: "Mudah diakses",
    claim: "Dipakai dari kantor, gudang, sampai lapangan.",
    proofs: [
      "Dibuka lewat browser, tampilan Bahasa Indonesia",
      "Notifikasi jatuh tempo & persetujuan langsung ke Telegram",
      "Aplikasi aset untuk staf lapangan, scan QR aset tanpa login",
    ],
  },
  {
    icon: "certificate",
    name: "Standar industri",
    claim: "Pembukuan yang siap diaudit.",
    proofs: [
      "Double-entry penuh, neraca & laba rugi sesuai PSAK",
      "PPN per item dan rekap pajak untuk SPT Masa",
      "Tutup buku tahunan otomatis, rekonsiliasi bank, jejak audit",
    ],
  },
  {
    icon: "trendingUp",
    name: "Skalabel",
    claim: "Tumbuh tanpa ganti sistem.",
    proofs: [
      "Dari UKM dengan 1–3 pengguna hingga pabrik dengan puluhan pengguna",
      "Multi-gudang, BOM, konversi produksi, dan HPP tinggal diaktifkan",
      "Satu buku besar untuk semua modul — data tidak tercecer",
    ],
  },
];

const REASONING_PROOFS: readonly string[] = [
  "Tanya data dalam bahasa sehari-hari",
  "Analisis laba, arus kas, piutang, stok, HPP",
  "Draf transaksi yang menunggu persetujuan Anda",
];

export function PillarsSection() {
  return (
    <section id="keunggulan" className="home-pillars" aria-labelledby="keunggulan-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Entaris" context="ERP yang bernalar" />
        <h2 id="keunggulan-heading" className="home-section-title home-pillars__title">
          ERP yang bisa bernalar — dan siap tumbuh bersama bisnis Anda.
        </h2>
        <p className="home-section-lead">
          ERP biasa mencatat transaksi. Entaris juga memahaminya: AIRA bernalar di atas buku besar yang sama, sementara fondasinya tetap fleksibel,
          mudah diakses, sesuai standar akuntansi, dan siap mengikuti skala bisnis Anda.
        </p>
      </div>
      <div className="home-pillars__grid">
        <article className="home-pillars__lead">
          <span className="home-pillars__icon home-pillars__icon--lead">
            <Icon name="sparkles" />
          </span>
          <p className="home-pillars__kicker">Kemampuan reasoning · AIRA</p>
          <h3 className="home-pillars__lead-title">Bertanya, menganalisis, dan menyiapkan keputusan.</h3>
          <p className="home-pillars__lead-text">
            AIRA, agen AI bawaan Entaris, bekerja di atas data transaksi yang sama — bukan salinan. Jawabannya selalu konsisten dengan buku besar, dan
            setiap perubahan pembukuan tetap menunggu persetujuan manusia.
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
    </section>
  );
}
