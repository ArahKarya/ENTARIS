import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { AiraMain } from "@/components/erp/proto-b8eece0a/AiraMain";
import "./aira.css";

export const metadata: Metadata = {
  title: "AIRA — agen AI di dalam Entaris",
  description:
    "AIRA bernalar di atas data transaksi yang sama dengan buku besar Entaris: menjawab pertanyaan data, menyiapkan draf, dan setiap perubahan pembukuan menunggu persetujuan manusia.",
};

export default function Page() {
  return (
    <SiteShell>
      <AiraMain />
    </SiteShell>
  );
}
