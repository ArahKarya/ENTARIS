import { CtaLink, type CtaSpec } from "./CtaLink";

/* Closing card (ported "proto-cta" markup): headline, text, buttons and an optional checklist. */
type PageCtaProps = {
  id?: string;
  eyebrow?: { name: string; context?: string };
  /** Headline split into display lines; the last line takes the accent colour. */
  lines: readonly string[];
  text: string;
  primary: CtaSpec;
  secondary?: CtaSpec;
  checklist?: { title: string; items: readonly string[] };
};

export function PageCta({ id = "cta", eyebrow, lines, text, primary, secondary, checklist }: PageCtaProps) {
  return (
    <section id={id} className="py-32 relative overflow-hidden proto-cta proto-cta--left proto-cta--actions-right" style={{ "--cta-accent": "var(--org)", "--cta-accent-text": "var(--org-on-light)", background: "transparent", color: "var(--foreground)" } as React.CSSProperties}>
      <div className="proto-cta__inner relative z-10">
        <div className="proto-cta__content">
          {eyebrow ? (
            <div className="proto-section-eyebrow proto-section-eyebrow--cta proto-section-eyebrow--underline" data-observe="reveal-up">
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">{eyebrow.name}</span>
                {eyebrow.context ? <span className="proto-section-eyebrow__context">{eyebrow.context}</span> : null}
              </span>
            </div>
          ) : null}
          <h2 className="font-heading text-4xl lg:text-6xl mb-6 leading-[0.9]" style={{ fontWeight: "900", letterSpacing: "0", color: "var(--cream)" }} data-observe="signature-reveal">
            {lines.map((line, index) => (
              <span
                key={line}
                data-line=""
                style={{ ...(index === lines.length - 1 ? { color: "var(--cta-accent-text)" } : null), "--stagger-index": String(index) } as React.CSSProperties}
              >
                {line}
              </span>
            ))}
          </h2>
          <p className="text-sm md:text-base mb-12 leading-relaxed max-w-[50ch] proto-cta__subtext" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }} data-observe="reveal-up">
            {text}
          </p>
        </div>
        <aside className="proto-cta__action-rail" aria-label="Langkah berikutnya">
          <div className="flex flex-stack sm:flex-row items-center proto-cta__actions justify-start gap-6" data-observe="reveal-up">
            <CtaLink cta={primary} variant="primary" size="lg" />
            {secondary ? <CtaLink cta={secondary} variant="ghost" size="lg" /> : null}
          </div>
        </aside>
        {checklist ? (
          <aside className="proto-cta__meta" aria-label={checklist.title}>
            <span className="proto-cta__meta-label">{checklist.title}</span>
            <ul className="pg-benefits">
              {checklist.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
