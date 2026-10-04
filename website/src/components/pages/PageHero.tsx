import { TablerIcon } from "@/components/erp/enterprise-28346646/sections/TablerIcon";
import { CtaLink, type CtaSpec } from "./CtaLink";

/*
 * Hero for the marketing sub-pages (ported ERP•AI "enterprise" hero markup). The `observed`
 * classes are added by useErpObserver (called by PageFrame) as each [data-observe] element enters
 * the viewport; the shader background is pure CSS.
 */
const CHECK_PATHS = ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M9 12l2 2l4 -4"] as const;
const CHECK_ICON_STYLE: React.CSSProperties = { color: "var(--hero-accent-text)" };

type PageHeroProps = {
  eyebrow: { name: string; context?: string };
  /** Headline split into display lines; the last line takes the accent colour. */
  lines: readonly string[];
  lead: string;
  primary?: CtaSpec;
  secondary?: CtaSpec;
  chips?: readonly string[];
  /** Compact hero (no viewport fill) for pages that should reach their form quickly. */
  compact?: boolean;
};

export function PageHero({ eyebrow, lines, lead, primary, secondary, chips, compact = false }: PageHeroProps) {
  const viewportClass = `max-w-[90rem] mx-auto relative erpai-hero__viewport${compact ? "" : " erpai-hero__viewport--fill"}`;
  return (
    <header className="erpai-hero relative border-b border-[var(--border)]" style={{ "--hero-accent": "var(--org)", "--hero-accent-text": "var(--org-on-light)" } as React.CSSProperties}>
      <div className="hero-bg-prototype hero-bg-prototype--shader" aria-hidden="true" />
      <div className={viewportClass} style={{ "--hero-extra-bottom": "0px" } as React.CSSProperties}>
        <div className="grid grid-cols-1 lg:grid-cols-12 w-full relative z-10">
          <div className="erpai-hero__column lg:col-span-12 px-6 lg:px-12 pt-12 pb-14 lg:pt-16 lg:pb-16" data-observe="stagger">
            <div className="proto-section-eyebrow proto-section-eyebrow--underline hero-eyebrow-underline mb-8" data-observe="reveal-up" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">{eyebrow.name}</span>
                {eyebrow.context ? <span className="proto-section-eyebrow__context">{eyebrow.context}</span> : null}
              </span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-6" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "0px", "--stagger-index": "1" } as React.CSSProperties} data-observe="signature-reveal">
              {lines.map((line, index) => (
                <span key={line} className="pg-hero__line" data-line="" style={{ "--stagger-index": String(index) } as React.CSSProperties}>
                  {/* Inner span: site.css forces the [data-line] colour, so the accent goes one level down. */}
                  {index === lines.length - 1 ? <span style={{ color: "var(--hero-accent-text)" }}>{line}</span> : line}
                </span>
              ))}
            </h1>
            <p className="text-base md:text-lg max-w-[56ch] leading-relaxed mb-8 pl-6 py-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-body)", borderLeft: "1px solid var(--border)", "--stagger-index": "3" } as React.CSSProperties} data-observe="reveal-up">
              {lead}
            </p>
            {primary ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4" data-observe="reveal-up" style={{ "--stagger-index": "4" } as React.CSSProperties}>
                <CtaLink cta={primary} variant="primary" size="xl" />
                {secondary ? <CtaLink cta={secondary} variant="ghost" size="xl" /> : null}
              </div>
            ) : null}
            {chips && chips.length > 0 ? (
              <div className="hero-checks flex flex-wrap font-mono uppercase tracking-label" style={{ color: "var(--text-m)", "--stagger-index": "5" } as React.CSSProperties} data-observe="reveal-up">
                {chips.map((chip) => (
                  <span key={chip} className="hero-checks__item flex items-center">
                    <TablerIcon name="circle-check" dataIcon="circle-check" paths={CHECK_PATHS} extraClass="hero-check-icon" style={CHECK_ICON_STYLE} />
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
