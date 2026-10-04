import { DEMO_HREF } from "@/components/site/siteConfig";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, DATABASE_PATHS, LOCK_PATHS, SCROLL_PATHS, TablerIcon } from "./TablerIcon";
import Link from "next/link";

/*
 * Keamanan & Data hero (customer-facing: no technical/deployment jargon). The `observed` classes are added by useErpObserver (called by SelfHostedMain)
 * when each [data-observe] element enters the viewport. The shader background is pure CSS.
 */
type HeroCheck = { name: string; paths: readonly string[]; label: string };

const HERO_CHECKS: readonly HeroCheck[] = [
  { name: "lock", paths: LOCK_PATHS, label: "Data tetap di server Anda" },
  { name: "database", paths: DATABASE_PATHS, label: "Siap pakai sejak hari pertama" },
  { name: "script", paths: SCROLL_PATHS, label: "Jejak audit setiap perubahan" },
];

const CHECK_ICON_STYLE: React.CSSProperties = { color: "var(--hero-accent-text)" };

const HEADLINE: readonly string[] = ["Server Anda.", "Data Anda.", "Buku besar Anda."];

export function SelfHostedHero() {
  return (
    <header className="erpai-hero relative border-b border-[var(--border)]" style={{ "--hero-accent": "var(--org)", "--hero-accent-text": "var(--org-on-light)" } as React.CSSProperties}>
      <div className="hero-bg-prototype hero-bg-prototype--shader" aria-hidden="true" />
      <div className="max-w-[90rem] mx-auto relative erpai-hero__viewport erpai-hero__viewport--fill" style={{ "--hero-extra-bottom": "0px" } as React.CSSProperties}>
        <div className="grid grid-cols-1 lg:grid-cols-12 w-full relative z-10">
          <div className="erpai-hero__column lg:col-span-12 px-6 lg:px-12 pt-12 pb-14 lg:pt-16 lg:pb-16" data-observe="stagger">
            <div className="proto-section-eyebrow proto-section-eyebrow--underline hero-eyebrow-underline mb-8" data-observe="reveal-up" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">Keamanan &amp; Data</span>
                <span className="proto-section-eyebrow__context">Di server Anda sendiri</span>
              </span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-6" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "0px", "--stagger-index": "1" } as React.CSSProperties} data-observe="signature-reveal">
              {HEADLINE.map((line, index) => (
                <span
                  key={line}
                  className="sh-hero__line"
                  data-line=""
                  style={{ "--stagger-index": String(index) } as React.CSSProperties}
                >
                  {/* Inner span: site.css forces the [data-line] colour, so the accent goes one level down. */}
                  {index === HEADLINE.length - 1 ? <span style={{ color: "var(--hero-accent-text)" }}>{line}</span> : line}
                </span>
              ))}
            </h1>
            <p className="text-base md:text-lg max-w-[56ch] leading-relaxed mb-8 pl-6 py-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-body)", borderLeft: "1px solid var(--border)", "--stagger-index": "3" } as React.CSSProperties} data-observe="reveal-up">
              Entaris berjalan di server milik perusahaan Anda — di kantor atau di cloud pilihan Anda. Data transaksi, laporan, dan cadangannya tetap di tangan Anda, bukan di tangan vendor.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4" data-observe="reveal-up" style={{ "--stagger-index": "4" } as React.CSSProperties}>
              <Link href={DEMO_HREF} className="btn btn--primary btn--xl">
                Minta demo
                <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} />
              </Link>
              <a href="#mulai" className="btn btn--ghost btn--xl">
                Lihat cara mulai ↓
              </a>
            </div>
            <div className="hero-checks flex flex-wrap font-mono uppercase tracking-label" style={{ color: "var(--text-m)", "--stagger-index": "5" } as React.CSSProperties} data-observe="reveal-up">
              {HERO_CHECKS.map((check) => (
                <span key={check.label} className="hero-checks__item flex items-center">
                  <TablerIcon name={check.name} dataIcon={check.name} paths={check.paths} extraClass="hero-check-icon" style={CHECK_ICON_STYLE} />
                  {check.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
