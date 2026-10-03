import Link from "next/link";
import { toCloneHref } from "../../shared/links";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, TablerIcon } from "./TablerIcon";

/*
 * m06 — #cta. data-tone on the trace states is styling only (no script targets it); the
 * data-observe / data-line hooks are driven by useErpObserver from EnterpriseMain.
 */
type TraceRow = { phase: string; signal: string; state: string };

const TRACE_ROWS: readonly TraceRow[] = [
  { phase: "Identity", signal: "users and accounts", state: "product" },
  { phase: "Access", signal: "roles and permissions", state: "product" },
  { phase: "Deploy", signal: "environment boundary", state: "contract" },
  { phase: "Audit", signal: "change record", state: "product" },
];

const TRACE_TONE = "orange";

export function EnterpriseCta() {
  return (
    <section id="cta" className="py-32 relative overflow-hidden proto-cta proto-cta--left proto-cta--actions-right" style={{ "--cta-accent": "var(--org)", "--cta-accent-text": "var(--org-on-light)", background: "transparent", color: "var(--foreground)" } as React.CSSProperties}>
      <div className="proto-cta__inner relative z-10">
        <div className="proto-cta__content">
          <div className="proto-section-eyebrow proto-section-eyebrow--cta proto-section-eyebrow--underline" data-observe="reveal-up">
            <span className="proto-section-eyebrow__rail" aria-hidden="true" />
            <span className="proto-section-eyebrow__copy">
              <span className="proto-section-eyebrow__name">Enterprise</span>
              <span className="proto-section-eyebrow__context">Confirm product and contract scope</span>
            </span>
          </div>
          <h2 className="font-heading text-4xl lg:text-6xl mb-6 leading-[0.9]" style={{ fontWeight: "900", letterSpacing: "0", color: "var(--cream)" }} data-observe="signature-reveal">
            <span data-line="" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              Map the identity
            </span>
            <span style={{ color: "var(--cta-accent-text)", "--stagger-index": "1" } as React.CSSProperties} data-line="">
              before granting access.
            </span>
          </h2>
          <p className="text-sm md:text-base mb-12 leading-relaxed max-w-[50ch] proto-cta__subtext" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }} data-observe="reveal-up">
            Review roles, app boundaries, audit coverage, deployment ownership, and contract terms.
          </p>
        </div>
        <aside className="proto-cta__action-rail" aria-label="Next actions">
          <div className="flex flex-stack sm:flex-row items-center proto-cta__actions justify-start gap-6" data-observe="reveal-up">
            <Link href={toCloneHref("/contact")} className="btn btn--primary btn--lg">
              Contact sales
              <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} />
            </Link>
            <Link href={toCloneHref("/pricing")} className="btn btn--ghost btn--lg">
              Review pricing
            </Link>
          </div>
        </aside>
        <aside className="proto-cta__meta" aria-label="Enterprise action path">
          <span className="proto-cta__meta-label">Enterprise action path</span>
          <div className="proto-cta__trace-table" role="table" aria-label="Enterprise action path">
            <div className="proto-cta__trace-row proto-cta__trace-row--head" role="row">
              <span role="columnheader">Phase</span>
              <span role="columnheader">Signal</span>
              <span role="columnheader">State</span>
            </div>
            {TRACE_ROWS.map((row) => (
              <div key={row.phase} className="proto-cta__trace-row" role="row">
                <span role="cell" className="proto-cta__trace-phase">
                  {row.phase}
                </span>
                <span role="cell" className="proto-cta__trace-signal">
                  {row.signal}
                </span>
                <span role="cell" className="proto-cta__trace-state" data-tone={TRACE_TONE}>
                  {row.state}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
