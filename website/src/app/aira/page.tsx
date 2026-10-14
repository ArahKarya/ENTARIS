import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { AiraMain } from "@/components/erp/proto-b8eece0a/AiraMain";
import "./aira.css";

export const metadata: Metadata = {
  title: "AIRA, agen AI di dalam Entaris",
  description:
    "AIRA ikut bekerja di atas data transaksi Entaris: menjawab pertanyaan, menganalisis laporan, menyusun draf dokumen, dan membaca foto nota. Setiap perubahan pembukuan menunggu persetujuan Anda.",
};

export default function Page() {
  return (
    <SiteShell>
      <AiraMain />
    </SiteShell>
  );
}
