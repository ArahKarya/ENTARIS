import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { EnterpriseMain } from "@/components/erp/enterprise-28346646/EnterpriseMain";

export const metadata: Metadata = { title: "Self-hosted — data Anda tetap di server Anda" };

export default function Page() {
  return (
    <SiteShell>
      <EnterpriseMain />
    </SiteShell>
  );
}
