import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { SelfHostedMain } from "@/components/erp/enterprise-28346646/SelfHostedMain";
import "./self-hosted.css";

export const metadata: Metadata = {
  title: "Self-hosted — data Anda tetap di server Anda",
  description:
    "Entaris berjalan di infrastruktur Anda sendiri lewat Docker Compose: aplikasi, database PostgreSQL, dan backup tetap di server Anda. Satu perintah deploy.",
};

export default function Page() {
  return (
    <SiteShell>
      <SelfHostedMain />
    </SiteShell>
  );
}
