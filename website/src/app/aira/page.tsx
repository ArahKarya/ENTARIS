import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { AiraMain } from "@/components/erp/proto-b8eece0a/AiraMain";
import "./aira.css";

export const metadata: Metadata = {
  title: "AIRA, agen AI di dalam Entaris",
  description:
    "AIRA (Artificial Intelligence Reasoning Agent) ikut bekerja di atas data transaksi real-time ENTARIS melalui protokol MCP: menjawab pertanyaan, menganalisis laporan, menyusun draf dokumen bisnis, dan memproses foto nota dengan gerbang persetujuan aman.",
};

export default function Page() {
  return (
    <SiteShell>
      <AiraMain />
    </SiteShell>
  );
}
