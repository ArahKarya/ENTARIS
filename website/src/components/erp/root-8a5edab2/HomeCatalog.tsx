"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "@/components/home/HomeIcons";
import { ModuleCard } from "@/components/home/ModuleCard";
import { SectionEyebrow } from "@/components/home/SectionEyebrow";
import { PillarsSection } from "@/components/home/Pillars";
import { FitSection, WhySection } from "@/components/home/WhyEntaris";
import { CATEGORIES } from "@/components/home/homeContent";
import type { ModuleCategory } from "@/components/home/homeContent";

/*
 * Home body (`main#main-content`): the module catalog with category tabs, then "Kenapa Entaris"
 * and "Cocok untuk". Each category block carries an `id` (`modul-<slug>`) the footer links to.
 */

const ALL = "semua";
const ANCHOR_PREFIX = "#modul-";
const TOTAL_MODULES = CATEGORIES.reduce((sum, c) => sum + c.modules.length, 0);

type Tab = { slug: string; label: string; count: number };

const TABS: readonly Tab[] = [
  { slug: ALL, label: "Semua", count: TOTAL_MODULES },
  ...CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, count: c.modules.length })),
];

/** Clears the tab filter when a footer link targets a category, so the anchor is visible. */
function useAnchorReset(setFilter: (slug: string) => void): void {
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith(ANCHOR_PREFIX)) return;
      setFilter(ALL);
      window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setFilter]);
}

function FilterBar({ active, onSelect }: { active: string; onSelect: (slug: string) => void }) {
  return (
    <div id="catalog-filter-bar" className="z-30 flex items-stretch">
      <div className="catalog-filter-shell">
        <div className="catalog-filter-track flex-1 overflow-x-auto flex items-center gap-0" role="group" aria-label="Filter kategori modul">
          {TABS.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              className="catalog-filter-btn font-body text-sm whitespace-nowrap flex-shrink-0"
              aria-current={active === tab.slug ? "page" : undefined}
              aria-pressed={active === tab.slug}
              onClick={() => onSelect(tab.slug)}
            >
              <span className="catalog-filter-btn__label">{tab.label}</span>
              <span className="catalog-filter-btn__count">{tab.count} modul</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryBlock({ category, hidden }: { category: ModuleCategory; hidden: boolean }) {
  const headerStyle = { "--row-accent": category.color } as CSSProperties;
  return (
    <div id={`modul-${category.slug}`} className="catalog-row home-module-row" hidden={hidden}>
      <div className="catalog-row-header home-module-row__header" style={headerStyle}>
        <div className="catalog-row-copy min-w-0">
          <div className="catalog-row-heading flex min-w-0 items-center gap-3">
            <h3 className="catalog-row-title min-w-0">
              <Icon name={category.icon} className="catalog-row-title__icon" />
              <span className="catalog-row-title__label">{category.label}</span>
            </h3>
          </div>
          <p className="home-module-row__summary">{category.summary}</p>
        </div>
        <span className="home-module-row__count">{category.modules.length} modul</span>
      </div>
      <div className="home-catalog-row home-module-row__grid">
        <div className="catalog-scroll-track catalog-scroll-track--gallery home-catalog-grid">
          {category.modules.map((m, i) => (
            <ModuleCard key={m.name} category={category} name={m.name} desc={m.desc} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomeCatalog() {
  const [filter, setFilter] = useState<string>(ALL);
  useAnchorReset(setFilter);

  return (
    <main id="main-content" className="flex-1 main--full-bleed tacet-home-page">
      <PillarsSection />
      <section id="modul" className="home-row-catalog home-modules" aria-labelledby="modul-heading">
        <div className="home-section-head">
          <SectionEyebrow name="Modul" context={`${TOTAL_MODULES} modul · ${CATEGORIES.length} area bisnis`} />
          <h2 id="modul-heading" className="home-section-title">
            Satu sistem, satu buku besar
          </h2>
          <p className="home-section-lead">
            Semua modul terintegrasi pada satu basis data dengan posting otomatis ke buku besar — angka di dashboard dan
            laporan selalu konsisten dengan transaksi sumbernya.
          </p>
        </div>
        <FilterBar active={filter} onSelect={setFilter} />
        <div className="home-module-rows">
          {CATEGORIES.map((category) => (
            <CategoryBlock key={category.slug} category={category} hidden={filter !== ALL && filter !== category.slug} />
          ))}
        </div>
      </section>
      <WhySection />
      <FitSection />
    </main>
  );
}
