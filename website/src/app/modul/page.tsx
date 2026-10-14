import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { ModuleCatalog } from "@/components/home/ModuleCatalog";
import "../home.css";

export const metadata: Metadata = {
  title: "Modul Entaris: penjualan, pembelian, stok, produksi, keuangan",
  description:
    "Semua modul Entaris memakai data yang sama dan mencatat jurnal otomatis ke buku besar. Cari modul berdasarkan fungsi, lalu lihat alur kerjanya.",
};

export default function Page() {
  return (
    <SiteShell>
      <ModuleCatalog />
    </SiteShell>
  );
}
