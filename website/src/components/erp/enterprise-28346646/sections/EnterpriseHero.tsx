import Link from "next/link";
import { toCloneHref } from "../../shared/links";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, TablerIcon } from "./TablerIcon";

/*
 * m00 — enterprise hero. The `observed` classes from the capture are left off: useErpObserver
 * (called by EnterpriseMain) adds them when each [data-observe] element enters the viewport.
 * The shader background and entrance animations are pure CSS; its min-height depends on
 * --chrome-height, which the nav (PageChrome / ProtoNav shell port) publishes.
 */
type HeroCheck = { name: string; dataIcon: string; paths: readonly string[]; label: string };

const HERO_CHECKS: readonly HeroCheck[] = [
  {
    name: "users",
    dataIcon: "users",
    paths: [
      "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
      "M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2",
      "M16 3.13a4 4 0 0 1 0 7.75",
      "M21 21v-2a4 4 0 0 0 -3 -3.85",
    ],
    label: "Users and app roles are named",
  },
  {
    name: "script",
    dataIcon: "scroll-text",
    paths: ["M17 20h-11a3 3 0 0 1 0 -6h11a3 3 0 0 0 0 6h1a3 3 0 0 0 3 -3v-11a2 2 0 0 0 -2 -2h-10a2 2 0 0 0 -2 2v8"],
    label: "Audit records stay queryable",
  },
  {
    name: "arrow-right",
    dataIcon: "arrow-right",
    paths: ARROW_RIGHT_PATHS,
    label: "Deployment terms are contract-defined",
  },
];

const CHECK_ICON_STYLE: React.CSSProperties = { color: "var(--hero-accent-text)" };

export function EnterpriseHero() {
  return (
    <header className="erpai-hero relative border-b border-[var(--border)]" style={{ "--hero-accent": "var(--org)", "--hero-accent-text": "var(--org-on-light)" } as React.CSSProperties}>
      <div className="hero-bg-prototype hero-bg-prototype--shader" aria-hidden="true" />
      <div className="max-w-[90rem] mx-auto relative erpai-hero__viewport erpai-hero__viewport--fill" style={{ "--hero-extra-bottom": "0px" } as React.CSSProperties}>
        <div className="grid grid-cols-1 lg:grid-cols-12 w-full relative z-10">
          <div className="erpai-hero__column lg:col-span-12 px-6 lg:px-12 pt-12 pb-14 lg:pt-16 lg:pb-16" data-observe="stagger">
            <div className="proto-section-eyebrow proto-section-eyebrow--underline hero-eyebrow-underline mb-8" data-observe="reveal-up" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">Enterprise controls</span>
                <span className="proto-section-eyebrow__context">Identity, audit, deployment, support</span>
              </span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-4 uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "0px", "--stagger-index": "1" } as React.CSSProperties} data-observe="signature-reveal">
              <span className="inline-block" data-line="" style={{ "--stagger-index": "0" } as React.CSSProperties}>
                Enterprise{" "}
                <span style={{ color: "var(--hero-accent-text)" }}>.</span>
              </span>
              <br />
              <span style={{ color: "var(--hero-accent-text)", "--stagger-index": "1" } as React.CSSProperties} data-line="">
                Identity, access, deployment, and evidence
              </span>
            </h1>
            <p className="font-serif italic text-xl lg:text-2xl leading-snug mb-6" style={{ color: "color-mix(in oklch, var(--hero-accent-text), transparent 30%)", "--stagger-index": "2" } as React.CSSProperties} data-observe="reveal-up">
              Name the caller, scope the access, record the result.
            </p>
            <p className="text-base md:text-lg max-w-[50ch] leading-relaxed mb-8 pl-6 py-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-body)", borderLeft: "1px solid var(--border)", "--stagger-index": "3" } as React.CSSProperties} data-observe="reveal-up">
              ERP.AI separates organization identity, roles, app access, audit records, and deployment configuration. Contract terms define service levels, support, compliance scope, and any dedicated infrastructure.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4" data-observe="reveal-up" style={{ "--stagger-index": "4" } as React.CSSProperties}>
              <Link href={toCloneHref("/contact")} className="btn btn--primary btn--xl">
                Contact sales
                <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} />
              </Link>
              <a href="#control-map" className="btn btn--ghost btn--xl">
                Open the map
              </a>
            </div>
            <div className="hero-checks flex flex-wrap font-mono uppercase tracking-label" style={{ color: "var(--text-m)", "--stagger-index": "5" } as React.CSSProperties} data-observe="reveal-up">
              {HERO_CHECKS.map((check) => (
                <span key={check.label} className="hero-checks__item flex items-center">
                  <TablerIcon name={check.name} dataIcon={check.dataIcon} paths={check.paths} extraClass="hero-check-icon" style={CHECK_ICON_STYLE} />
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
