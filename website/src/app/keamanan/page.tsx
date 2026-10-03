import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { SelfHostedMain } from "@/components/erp/enterprise-28346646/SelfHostedMain";
import "./keamanan.css";

export const metadata: Metadata = {
  title: "Keamanan & Data — data Anda tetap milik Anda",
  description:
    "Entaris berjalan di server milik perusahaan Anda, di kantor atau di cloud pilihan Anda. Hak akses per peran, persetujuan dokumen, dan jejak audit di setiap perubahan.",
};

export default function Page() {
  return (
    <SiteShell>
      <SelfHostedMain />
    </SiteShell>
  );
}
