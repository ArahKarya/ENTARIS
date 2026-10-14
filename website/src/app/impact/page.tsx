import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { CP_HREF, CP_LABEL } from "@/components/site/siteConfig";
import { InfoMatrix } from "@/components/pages/InfoMatrix";
import { PageCta } from "@/components/pages/PageCta";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";
import { IMPACT_IS_PLACEHOLDER, INDUSTRY_ROWS } from "@/components/pages/impact/impactContent";
import { ImpactCompanies, ImpactQuotes } from "@/components/pages/impact/ImpactSections";
import "./impact.css";

export const metadata: Metadata = {
  title: "Impact: contoh industri dan cerita pengguna Entaris",
  description: "Lihat bagaimana UKM, distributor, pabrik, dan kantor akuntan memakai Entaris, dan apa kata mereka.",
};

const NAV_LINKS = [
  { href: "#contoh-industri", label: "Contoh industri" },
  { href: "#pengguna", label: "Mereka yang memakai Entaris" },
  { href: "#apa-kata-mereka", label: "Apa kata mereka" },
] as const;

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        banner={
          IMPACT_IS_PLACEHOLDER ? (
            <p className="pg-notice" role="note">
              Contoh tampilan: nama perusahaan, logo, angka, dan kutipan di halaman ini masih data sementara.
            </p>
          ) : null
        }
        navLinks={NAV_LINKS}
        navLabel="Navigasi halaman Impact"
        hero={
          <PageHero
            eyebrow={{ name: "Impact" }}
            lines={IMPACT_IS_PLACEHOLDER ? ["Gambaran Entaris,", "dari gudang sampai pabrik."] : ["Dipakai bisnis nyata,", "dari gudang sampai pabrik."]}
            lead={
              IMPACT_IS_PLACEHOLDER
                ? "Contoh cara Entaris dipakai di UKM, distributor, pabrik, dan kantor akuntan. Cerita pengguna asli menyusul setelah mereka mengizinkan."
                : "Entaris berjalan di UKM, distributor, pabrik, dan kantor akuntan. Lihat bagaimana mereka memakainya dan apa kata mereka."
            }
            primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
          />
        }
      >
        <InfoMatrix
          id="contoh-industri"
          kicker="Contoh industri"
          title="Satu sistem, banyak jenis bisnis."
          head={["Industri", "Masalah sebelum Entaris", "Yang berubah"]}
          rows={INDUSTRY_ROWS}
          columns="minmax(11rem, 0.22fr) repeat(2, minmax(0, 0.39fr))"
          ariaLabel="Contoh penggunaan Entaris per industri"
        />
        <ImpactCompanies />
        <ImpactQuotes />
        <PageCta
          lines={["Bisnis Anda", "berikutnya?"]}
          text="Ceritakan cara kerja bisnis Anda; kami tunjukkan Entaris berjalan di data yang mirip."
          primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
        />
      </PageFrame>
    </SiteShell>
  );
}
