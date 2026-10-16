"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PageCta } from "@/components/pages/PageCta";
import { CP_HREF, CP_LABEL } from "@/components/site/siteConfig";
import { useErpObserver } from "@/components/erp/shared/useErpObserver";
import { BusinessTypesSection } from "@/components/home/BusinessTypes";
import { VideoShowcase } from "@/components/home/VideoShowcase";
import { PricingTeaser } from "@/components/home/PricingTeaser";
import { FeaturedModules } from "@/components/home/FeaturedModules";
import type { FeaturedModule } from "@/components/home/FeaturedModules";
import { ModuleDetailModal } from "@/components/home/ModuleDetailModal";

/** Home below the hero: the featured modules, who Entaris fits, and the contact call to action. */
export function HomeCatalog() {
  const [selectedModule, setSelectedModule] = useState<FeaturedModule | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useErpObserver(mainRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 main--full-bleed tacet-home-page">
      <VideoShowcase />

      <FeaturedModules onSelectModule={setSelectedModule} />

      <p className="home-all-modules">
        <Link href="/modul" className="home-all-modules__link">
          Lihat semua modul
        </Link>
      </p>

      <BusinessTypesSection />

      <PricingTeaser />

      <div className="proto-saas">
        <PageCta
          eyebrow={{ name: "Mulai dari percakapan", context: "Tanpa formulir" }}
          lines={["Ceritakan usaha Anda,", "kami bantu mulai."]}
          text="Hubungi CP lewat WhatsApp untuk melihat Entaris berjalan di usaha Anda. Data tetap di server perusahaan Anda."
          primary={{ label: CP_LABEL, href: CP_HREF, arrow: true }}
          secondary={{ label: "Kenali AIRA", href: "/aira" }}
          checklist={{
            title: "Yang Anda dapat",
            items: [
              "Aplikasi & data di server perusahaan Anda",
              "Empat peran bawaan, plus peran sesuai struktur Anda",
              "Persetujuan dokumen & jejak audit lengkap",
              "AIRA, agen AI untuk tanya data & analisis laporan",
            ],
          }}
        />
      </div>

      <ModuleDetailModal module={selectedModule} onClose={() => setSelectedModule(null)} />
    </main>
  );
}
