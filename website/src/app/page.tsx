import { SiteShell } from "@/components/site/SiteShell";
import { HeroCatalog } from "@/components/erp/root-8a5edab2/HeroCatalog";
import { HomeCatalog } from "@/components/erp/root-8a5edab2/HomeCatalog";
import "./home.css";

export default function Page() {
  return (
    <SiteShell home>
      <HeroCatalog />
      <HomeCatalog />
    </SiteShell>
  );
}
