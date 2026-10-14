"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "./HomeIcons";
import { ModuleCard } from "./ModuleCard";
import { SectionEyebrow } from "./SectionEyebrow";
import { useErpObserver } from "@/components/erp/shared/useErpObserver";
import { CATEGORIES } from "./homeContent";
import type { ModuleCategory } from "./homeContent";
import { FEATURED_MODULES } from "./FeaturedModules";
import type { FeaturedModule } from "./FeaturedModules";
import { ModuleDetailModal } from "./ModuleDetailModal";

const ALL = "semua";
const ANCHOR_PREFIX = "#modul-";
const TOTAL_MODULES = CATEGORIES.reduce((sum, c) => sum + c.modules.length, 0);

type Tab = { slug: string; label: string; count: number };

const TABS: readonly Tab[] = [
  { slug: ALL, label: "Semua", count: TOTAL_MODULES },
  ...CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, count: c.modules.length })),
];

const QUICK_TAGS = [
  "Pengajuan Pembayaran",
  "Foto Nota",
  "Buku Besar",
  "Surat Jalan",
  "HPP Real-time",
  "PPN per baris",
  "Stock Opname",
  "Rendemen Produksi",
  "Rekonsiliasi Bank",
  "Armada & EAM",
] as const;

function toFeaturedModule(category: ModuleCategory, m: { name: string; desc: string }, index: number): FeaturedModule {
  const match = FEATURED_MODULES.find(
    (f) => f.name.toLowerCase().includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(f.name.toLowerCase())
  );
  if (match) return match;
  return {
    id: `${category.slug}-${index}`,
    number: String(index + 1).padStart(2, "0"),
    name: m.name,
    category: category.label,
    categorySlug: category.slug,
    color: category.color,
    desc: m.desc,
    tags: [category.label, "Buku Besar", "Jejak Audit", "Hak Akses per Peran"],
    flow: ["Dokumen dibuat", "Cek wewenang", "Persetujuan", "Tercatat di buku besar"],
    glImpact: `Jurnal tercatat otomatis di buku besar sesuai standar PSAK. Setiap perubahan terekam di jejak audit beserta nilai sebelum dan sesudahnya.`,
    roles: "Admin, Accountant, Staf Produksi, Viewer (peran bisa ditambah)",
    airaCapability: `AIRA dapat membaca data transaksi di modul ini, menganalisis laporan, dan membuat draf otomatis untuk diperiksa tim Anda.`,
  };
}

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

function FilterBar({
  active,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  active: string;
  onSelect: (slug: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  return (
    <div id="catalog-filter-bar" className="z-30 flex flex-col items-stretch border-t border-[var(--border)]">
      {/* Search Input Bar (ERP.AI Search Pattern) */}
      <div className="catalog-search-shell">
        <div className="catalog-search-input-wrap">
          <Icon name="search" className="catalog-search-icon" style={{ width: 18, height: 18 }} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari modul atau fungsi (misal: Invoice, Surat Jalan, HPP, WAC, BOM, Bank)..."
            className="catalog-search-input font-body"
            aria-label="Cari modul bisnis"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="catalog-search-clear"
              aria-label="Hapus pencarian"
            >
              <Icon name="x" style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {/* Quick Tag Pills */}
        <div className="catalog-quick-tags" aria-label="Kata kunci populer">
          <span className="catalog-quick-tags__label">Kata kunci:</span>
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`catalog-quick-tag ${searchQuery === tag ? "is-active" : ""}`}
              onClick={() => onSearchChange(searchQuery === tag ? "" : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Category Tabs */}
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

function CategoryBlock({
  category,
  hidden,
  searchQuery,
  onSelectModule,
}: {
  category: ModuleCategory;
  hidden: boolean;
  searchQuery: string;
  onSelectModule: (m: FeaturedModule) => void;
}) {
  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return category.modules;
    const q = searchQuery.toLowerCase();
    return category.modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        category.label.toLowerCase().includes(q)
    );
  }, [category, searchQuery]);

  if (hidden || (searchQuery.trim() && filteredModules.length === 0)) {
    return null;
  }

  const headerStyle = { "--row-accent": category.color } as CSSProperties;

  return (
    <div id={`modul-${category.slug}`} className="catalog-row home-module-row">
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
        <span className="home-module-row__count">{filteredModules.length} modul</span>
      </div>
      <div className="home-catalog-row home-module-row__grid">
        <div className="catalog-scroll-track catalog-scroll-track--gallery home-catalog-grid">
          {filteredModules.map((m, i) => (
            <ModuleCard
              key={m.name}
              category={category}
              name={m.name}
              desc={m.desc}
              index={i}
              onClick={() => onSelectModule(toFeaturedModule(category, m, i))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** /modul: the full module catalog with search, category filter and the detail modal. */
export function ModuleCatalog() {
  const [filter, setFilter] = useState<string>(ALL);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<FeaturedModule | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useAnchorReset(setFilter);
  useErpObserver(mainRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 main--full-bleed tacet-home-page">
      <section id="modul" className="home-row-catalog home-modules" aria-labelledby="modul-heading">
        <div className="home-section-head">
          <SectionEyebrow name="Katalog Modul" context={`${TOTAL_MODULES} modul · ${CATEGORIES.length} area bisnis`} />
          <h1 id="modul-heading" className="home-section-title">
            Satu sistem, satu buku besar
          </h1>
          <p className="home-section-lead">
            Semua modul memakai data yang sama dan otomatis mencatat jurnal ke buku besar, jadi angka di dashboard dan
            laporan selalu cocok dengan transaksi sumbernya. Klik modul mana saja untuk melihat alur kerja dan perlakuan PSAK-nya.
          </p>
        </div>

        <FilterBar active={filter} onSelect={setFilter} searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        <div className="home-module-rows">
          {CATEGORIES.map((category) => (
            <CategoryBlock
              key={category.slug}
              category={category}
              hidden={filter !== ALL && filter !== category.slug}
              searchQuery={searchQuery}
              onSelectModule={setSelectedModule}
            />
          ))}
        </div>
      </section>

      <ModuleDetailModal module={selectedModule} onClose={() => setSelectedModule(null)} />
    </main>
  );
}
