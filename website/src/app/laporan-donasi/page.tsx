import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";
import { RecordSection } from "@/components/pages/RecordSection";

export const metadata: Metadata = {
  title: "Laporan Donasi: ke mana 30% itu pergi",
  description: "Cara kami menghitung dan menyalurkan 30%, dan laporan bulanan untuk pengguna terdaftar.",
};

const ENTRIES = [
  { term: "Status", detail: "Laporan pertama belum terbit. Halaman ini diperbarui saat laporan pertama terbit." },
  { term: "Dasar hitung Entaris", detail: "30% dari pendapatan bersih, sebelum dipotong biaya platform, bank, dan pajak (jika ada)." },
  { term: "Dasar hitung AIRA", detail: "30% dari laba bersih pemakaian AIRA, yaitu pendapatan AIRA dikurangi biaya API layanan dan pajak." },
  { term: "Penerima", detail: "Lembaga resmi penyalur zakat dan donasi, atau yayasan lokal di sekitar kami. Setiap laporan mencantumkan lembaga dan jumlah yang disalurkan." },
  { term: "Tujuan", detail: "Bantuan bencana alam, bantuan langsung, dan fakir miskin." },
  { term: "Siapa yang menerima laporan", detail: "Semua pengguna terdaftar, setiap bulan." },
] as const;

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Laporan Donasi" }}
            lines={["Ke mana 30% itu pergi,", "kami laporkan tiap bulan."]}
            lead="Setiap bulan pengguna terdaftar menerima ringkasan: berapa yang disisihkan, dan ke lembaga mana disalurkan."
            primary={{ label: "Lihat Harga dan Misi", href: "/harga" }}
            compact
          />
        }
      >
        <RecordSection
          id="laporan"
          kicker="Laporan bulanan"
          title="Cara kami menghitung dan menyalurkan."
          text="Aturannya ditulis di sini supaya bisa diperiksa siapa saja."
          entries={ENTRIES}
        />
      </PageFrame>
    </SiteShell>
  );
}
