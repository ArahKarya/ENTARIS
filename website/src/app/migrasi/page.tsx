import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";
import { StepFlow } from "@/components/pages/StepFlow";

export const metadata: Metadata = {
  title: "Migrasi ke Entaris — cukup chat dengan AIRA",
  description:
    "Pindah ke Entaris tanpa ekspor-impor yang ribet: ceritakan bisnis Anda ke AIRA, dan setup awal, migrasi data, serta pembuatan buku besar dikerjakan lewat chat.",
};

const NAV_LINKS = [
  { href: "#untuk-siapa", label: "Untuk siapa" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#dikerjakan-aira", label: "Yang dikerjakan AIRA" },
  { href: "#dulu-vs-sekarang", label: "Dulu vs sekarang" },
] as const;

const AUDIENCE_ROWS = [
  [
    "Perusahaan baru",
    "Ceritakan jenis usaha, produk, dan cara Anda berjualan.",
    "Menyusun bagan akun, gudang, daftar barang, pajak, dan peran pengguna dari cerita Anda.",
  ],
  [
    "Perusahaan yang sudah berjalan (pakai Excel, buku tulis, atau software lain)",
    "Kirim apa saja yang Anda punya ke chat: file Excel, foto nota, laporan lama, atau cukup jelaskan.",
    "Membaca, merapikan, dan memindahkan saldo awal, stok, piutang, utang, dan kontak ke Entaris — lalu menunjukkan hasilnya untuk Anda setujui.",
  ],
] as const;

const FLOW_STEPS = [
  {
    label: "Langkah 1",
    title: "Ceritakan bisnis Anda",
    body: "AIRA bertanya seperlunya: bidang usaha, gudang, produk, cara bayar pelanggan dan vendor.",
  },
  {
    label: "Langkah 2",
    title: "Kirim data yang ada, apa pun bentuknya",
    body: "File Excel, PDF laporan, foto nota, atau ketik saja. Tidak ada template yang harus diisi.",
  },
  {
    label: "Langkah 3",
    title: "Periksa dan setujui",
    body: "AIRA menyiapkan semuanya sebagai draf. Anda cek ringkasannya, minta revisi lewat chat, lalu setujui. Entaris siap dipakai.",
  },
] as const;

const WORK_ROWS = [
  ["Setup awal", "Perusahaan, gudang, pajak, dan pengguna dikonfigurasi dari percakapan."],
  ["Migrasi data", "Data dari Excel, software lama, atau catatan manual dibaca dan dipindahkan — tanpa ekspor-impor manual."],
  ["Pembuatan buku besar", "Bagan akun disusun sesuai jenis usaha dan standar akuntansi; saldo awal diposting dan langsung seimbang."],
  ["Penyusunan data", "Barang, pelanggan, vendor, harga, dan stok dirapikan: duplikat digabung, nama diseragamkan, yang kurang ditanyakan."],
  ["Pengecekan", "AIRA mencocokkan total saldo, stok, dan piutang dengan data lama Anda dan menunjukkan selisihnya sebelum Anda setujui."],
] as const;

const COMPARE_ROWS = [
  ["Isi template impor kolom demi kolom", "Kirim file apa adanya atau cukup cerita"],
  ["Konsultan setup berminggu-minggu", "Setup dari percakapan"],
  ["Buku besar disusun manual oleh akuntan", "Buku besar disusun AIRA, Anda tinggal menyetujui"],
  ["Error impor dicari satu per satu", "AIRA menunjukkan selisih dan menanyakan yang kurang"],
] as const;

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        navLinks={NAV_LINKS}
        navLabel="Navigasi halaman Migrasi"
        hero={
          <PageHero
            eyebrow={{ name: "Migrasi", context: "Cukup chat dengan AIRA" }}
            lines={["Pindah ke Entaris", "cukup dengan ngobrol."]}
            lead="Tidak perlu ekspor-impor data yang ribet. Ceritakan bisnis Anda ke AIRA — setup awal, migrasi data, pembuatan buku besar, sampai penyusunan semua data dikerjakan AIRA. Tanpa ribet, tanpa lama."
            primary={{ label: "Minta demo", href: DEMO_HREF, arrow: true }}
          />
        }
      >
        <InfoMatrix
          id="untuk-siapa"
          kicker="Untuk siapa"
          title="Baru mulai atau sudah lama berjalan, caranya sama: chat."
          head={["Kondisi", "Yang Anda lakukan", "Yang AIRA kerjakan"]}
          rows={AUDIENCE_ROWS}
          columns="minmax(11rem, 0.24fr) repeat(2, minmax(0, 0.38fr))"
          ariaLabel="Migrasi untuk perusahaan baru dan yang sudah berjalan"
        />
        <StepFlow
          id="cara-kerja"
          kicker="Cara kerja"
          title="Tiga langkah, semuanya di dalam chat."
          caption={{ label: "Alur migrasi", title: "Ceritakan → kirim → setujui" }}
          steps={FLOW_STEPS}
        />
        <InfoMatrix
          id="dikerjakan-aira"
          kicker="Yang dikerjakan AIRA"
          title="Semua yang biasanya makan waktu berminggu-minggu."
          head={["Pekerjaan", "Yang AIRA lakukan"]}
          rows={WORK_ROWS}
          columns="minmax(12rem, 0.28fr) minmax(0, 0.72fr)"
          ariaLabel="Pekerjaan yang dikerjakan AIRA saat migrasi"
          note="AIRA tidak memposting apa pun tanpa persetujuan Anda. Semua langkah tercatat dan bisa ditelusuri."
          quiet
        />
        <InfoMatrix
          id="dulu-vs-sekarang"
          kicker="Dulu vs sekarang"
          title="Tanpa ribet, tanpa lama."
          head={["Migrasi ERP biasa", "Migrasi dengan AIRA"]}
          rows={COMPARE_ROWS}
          columns="repeat(2, minmax(0, 1fr))"
          ariaLabel="Perbandingan migrasi ERP biasa dan migrasi dengan AIRA"
        />
        <PageCta
          lines={["Siap pindah?", "Mulai dengan satu chat."]}
          text="Lihat langsung bagaimana AIRA menyiapkan Entaris dari data bisnis Anda."
          primary={{ label: "Minta demo", href: DEMO_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
