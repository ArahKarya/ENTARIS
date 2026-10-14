import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CP_HREF, CP_LABEL } from "@/components/site/siteConfig";
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
  title: "Harga dan Misi: bayar semampunya, 30% untuk sosial",
  description:
    "Entaris dibayar semampunya tiap bulan tanpa batas minimum. AIRA gratis bila memakai AI Anda sendiri. 30% dari yang kami terima disalurkan untuk sosial.",
};

const ENTARIS_ENTRIES = [
  { term: "Cara membayar", detail: "Per bulan, sebesar yang menurut Anda pantas." },
  { term: "Batas minimum", detail: "Tidak ada." },
  { term: "Sampai kapan", detail: "Selama aplikasi masih bermanfaat bagi usaha Anda." },
  { term: "Tanpa AIRA", detail: "Entaris sudah lengkap tanpa AIRA. AIRA adalah fitur tambahan, bukan syarat." },
] as const;

const MISSION_ENTRIES = [
  { term: "Dari Entaris", detail: "30% dari pendapatan bersih, dihitung sebelum dipotong biaya platform, bank, dan pajak (jika ada)." },
  { term: "Dari AIRA", detail: "30% dari laba bersih pemakaian AIRA, yaitu pendapatan AIRA dikurangi biaya API layanan dan pajak." },
  { term: "Disalurkan ke", detail: "Lembaga resmi penyalur zakat dan donasi, atau yayasan lokal di sekitar kami." },
  { term: "Untuk", detail: "Bantuan bencana alam, bantuan langsung, dan fakir miskin." },
  { term: "Laporan", detail: "Ringkasan bulanan untuk semua pengguna terdaftar." },
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
            eyebrow={{ name: "Harga dan Misi" }}
            lines={["Bayar semampunya,", "tanpa batas minimum."]}
            lead="Entaris dibuat agar UMKM dan pemilik usaha bisa mengelola perusahaan tanpa ribet dan tanpa biaya besar. Tidak ada tarif tetap. Sebagian dari yang kami terima disalurkan untuk sosial."
            primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
            compact
          />
        }
      >
        <RecordSection
          id="entaris"
          kicker="Entaris"
          title="Bayar semampunya, tiap bulan."
          text="Anda menentukan sendiri jumlahnya. Kami percaya aplikasi yang benar-benar membantu usaha akan dibayar dengan wajar."
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
          kicker="Misi sosial"
          title="30% untuk sesama."
          text="Entaris dibuat untuk membantu. Karena itu sebagian dari yang kami terima kami salurkan untuk bantuan sosial."
          cta={{ label: "Lihat laporan donasi", href: "/laporan-donasi" }}
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
