import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { ProtoMain } from "@/components/erp/proto-b8eece0a/ProtoMain";

export const metadata: Metadata = { title: "AIRA — agen AI di dalam Entaris" };

export default function Page() {
  return (
    <SiteShell>
      <ProtoMain />
    </SiteShell>
  );
}
