import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CP_HREF, CP_LABEL, DONATE_URL } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";
import { RecordSection } from "@/components/pages/RecordSection";
import { AIRA_MARKUP, AIRA_PLANS, formatRupiah, priceRupiah } from "@/lib/airaPricing";
import { formatRateDate, getUsdIdrRate } from "@/lib/exchangeRate";

/** The price table follows the daily exchange rate, so the page is rebuilt once a day. */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Misi dan Dukungan: perangkat lunak terbuka dan gratis",
  description:
    "Entaris adalah perangkat lunak terbuka (AGPL-3.0) untuk kemajuan UMKM, bangsa, dan negara. Gratis dipakai, dengan dukungan sukarela. AIRA gratis bila memakai AI Anda sendiri.",
};

const ENTARIS_ENTRIES = [
  { term: "Biaya lisensi", detail: "Tidak ada. Siapa pun boleh memakai, mempelajari, dan mengubah Entaris." },
  { term: "Lisensi", detail: "AGPL-3.0. Kode sumber terbuka; perubahan yang dijalankan sebagai layanan bagi orang lain wajib ikut dibuka." },
  { term: "Tanpa AIRA", detail: "Entaris sudah lengkap tanpa AIRA. AIRA adalah fitur tambahan, bukan syarat." },
  { term: "Butuh bantuan pasang", detail: "Pemasangan, migrasi data, hosting terkelola, dan dukungan dapat diminta lewat CP." },
] as const;

const MISSION_ENTRIES = [
  { term: "Misi", detail: "Perangkat lunak terbuka untuk kemajuan UMKM, bangsa, dan negara." },
  { term: "Dukungan sukarela", detail: "Berapa pun nilainya, dipakai untuk pengembangan, pengujian, dan dokumentasi. Tidak ada kewajiban dan tidak ada fitur yang dikunci." },
  { term: "Cara lain membantu", detail: "Laporkan masalah, kirim perbaikan kode, tulis dokumentasi atau terjemahan, dan ceritakan Entaris ke sesama pelaku usaha." },
  { term: "Merek", detail: "Kode terbuka, tetapi nama dan logo Entaris, AIRA, dan Arah tetap milik PT Arah Karya Sinergi." },
] as const;

export default async function Page() {
  const { rate, date, live } = await getUsdIdrRate();
  const airaRows: readonly (readonly React.ReactNode[])[] = [
    ["AI milik Anda sendiri", "Gratis, tanpa biaya", "Anda sudah punya layanan AI sendiri, atau ingin menyambungkan AIRA ke aplikasi AI yang Anda pakai."],
    ...AIRA_PLANS.map((plan) => [
      plan.name,
      `Masuk ${formatRupiah(priceRupiah(plan.baseUsdPerMillionTokens.input, rate))}, keluar ${formatRupiah(priceRupiah(plan.baseUsdPerMillionTokens.output, rate))}, per 1 juta token. Dibayar sesuai pemakaian tiap bulan.`,
      plan.summary,
    ]),
    ["Tanpa AIRA", "Tidak ada biaya AIRA", "Anda cukup memakai Entaris tanpa agen AI."],
  ];
  const rateNote = (
    <>
      Token adalah satuan hitung pemakaian AI: potongan kata dari yang AIRA baca (masuk) dan yang AIRA tulis (keluar). Tarif
      dihitung dari harga dasar penyedia model dikali {String(AIRA_MARKUP).replace(".", ",")}, dibulatkan ke Rp100 terdekat, dalam rupiah, belum termasuk PPN.
      Kurs 1 USD = {formatRupiah(rate)} ({live ? `kurs ${formatRateDate(date)}, diperbarui otomatis setiap hari` : `kurs cadangan per ${formatRateDate(date)}, sumber kurs harian sedang tidak tersedia`}).
    </>
  );
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Misi dan Dukungan" }}
            lines={["Terbuka untuk semua,", "gratis dipakai."]}
            lead="Entaris dibuat agar UMKM dan pemilik usaha bisa mengelola perusahaan tanpa ribet dan tanpa biaya lisensi. Kodenya terbuka, dan dukungan Anda bersifat sukarela."
            primary={DONATE_URL ? { label: "Dukung Entaris", href: DONATE_URL, arrow: true } : { label: CP_LABEL, href: CP_HREF, arrow: true }}
            compact
          />
        }
      >
        <RecordSection
          id="entaris"
          kicker="Entaris"
          title="Gratis, dan akan tetap gratis."
          text="Tidak ada paket berbayar yang mengunci fitur. Yang berbayar hanya layanan yang kami kerjakan untuk Anda, bila Anda memintanya."
          entries={ENTARIS_ENTRIES}
        />
        <InfoMatrix
          id="aira"
          kicker="AIRA"
          title="Cara memakai AIRA dan biayanya."
          lead="AIRA adalah fitur tambahan. Anda bebas memilih cara yang paling sesuai."
          head={["Pilihan", "Biayanya", "Cocok bila"]}
          rows={airaRows}
          columns="minmax(10rem, 0.22fr) repeat(2, minmax(0, 0.39fr))"
          ariaLabel="Pilihan memakai AIRA dan biayanya"
          note={rateNote}
        />
        <RecordSection
          id="misi"
          kicker="Misi"
          title="Untuk UMKM, bangsa, dan negara."
          text="Entaris dibuat untuk membantu. Bila bermanfaat bagi usaha Anda, dukungan sukarela membuat pengembangannya terus berjalan."
          cta={DONATE_URL ? { label: "Dukung Entaris", href: DONATE_URL, arrow: true } : undefined}
          entries={MISSION_ENTRIES}
        />
        <PageCta
          lines={["Mau tahu apakah", "Entaris cocok?"]}
          text="Ceritakan usaha Anda lewat WhatsApp. CP akan menjawab sesuai kebutuhan Anda."
          primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
