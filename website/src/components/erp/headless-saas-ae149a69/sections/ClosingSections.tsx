import Link from "next/link";
import type { CSSProperties } from "react";
import { toCloneHref } from "@/components/erp/shared/links";

/** #thesis — closing definition + quote. */
export function ThesisSection() {
  return (
    <section id="thesis" className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="border-b border-[var(--border)] border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 max-w-[90rem] mx-auto">
          <div className="lg:col-span-12 px-6 lg:px-12 pt-12 lg:pt-16 pb-12 lg:pb-16">
            <div className="proto-section-eyebrow">
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">
                  The definition
                </span>
                <span className="proto-section-eyebrow__context">
                  Plainly stated
                </span>
              </span>
            </div>
            <h2 className="font-heading text-2xl lg:text-3xl uppercase mb-6" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
               A full product with a reusable service layer 
            </h2>
            <div className="prose-content text-sm lg:text-base leading-relaxed max-w-[65ch]" style={{ fontFamily: "var(--font-body)", color: "var(--foreground)" }}>
              <p>
                That is what Headless SaaS means here. ERP.AI has a web interface, and its business capabilities also sit behind services used by other approved clients.
              </p>
              <p style={{ marginTop: "1rem" }}>
                It does not mean every internal operation is public. It does not mean every client has the same access. It means the platform can support more than one interface without duplicating the core product.
              </p>
            </div>
          </div>
          <div className="lg:col-span-4 px-6 lg:px-8 py-12 lg:py-16 flex items-center" style={{ background: "var(--card)" }}>
            <blockquote className="relative">
              <span className="font-heading text-6xl leading-none absolute -top-4 -left-2" style={{ color: "var(--red-on-light)", opacity: "0.3" }} aria-hidden="true">
                {" \" "}
              </span>
              <p className="font-serif italic text-lg lg:text-xl leading-snug pl-4" style={{ color: "var(--foreground)" }}>
                <span className="block" data-line="">
                  Keep the interface.
                </span>
                <span className="block" data-line="">
                  Keep the business logic reusable.
                </span>
              </p>
              <cite className="block mt-4 pl-4 font-mono text-label uppercase tracking-label not-italic" style={{ color: "var(--text-m)" }}>
                 ERP.AI 
              </cite>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #cta — sign-in CTA + platform summary trace table. */
export function CtaSection() {
  return (
    <section id="cta" className="py-32 relative overflow-hidden proto-cta proto-cta--left" style={{ "--cta-accent": "var(--org)", "--cta-accent-text": "var(--org-on-light)", background: "transparent", color: "var(--foreground)" } as CSSProperties}>
      <div className="proto-cta__inner relative z-10">
        <div className="proto-cta__content">
          <div className="proto-section-eyebrow proto-section-eyebrow--cta proto-section-eyebrow--underline">
            <span className="proto-section-eyebrow__rail" aria-hidden="true" />
            <span className="proto-section-eyebrow__copy">
              <span className="proto-section-eyebrow__name">
                Headless SaaS
              </span>
              <span className="proto-section-eyebrow__context">
                Shared platform services
              </span>
            </span>
          </div>
          <h2 className="font-heading text-4xl lg:text-6xl mb-6 leading-[0.9]" style={{ fontWeight: "900", letterSpacing: "0", color: "var(--cream)" }}>
             Use the product 
            <span style={{ color: "var(--cta-accent-text)" }}>
              through the right client.
            </span>
          </h2>
          <p className="text-sm md:text-base mb-12 leading-relaxed max-w-[50ch] proto-cta__subtext" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
             Build in the ERP.AI web app, work through Proto, or connect an approved client with its own scoped identity. 
          </p>
          <div className="flex flex-stack sm:flex-row items-center proto-cta__actions justify-start gap-6">
            <a href="https://app.erpai.studio/sign-in" className="btn btn--primary btn--lg">
               Sign In 
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "16px", height: "16px" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
            </a>
            <Link href={toCloneHref("/version-control")} className="btn btn--ghost btn--lg">
               See Command Centre version control 
            </Link>
          </div>
        </div>
        <aside className="proto-cta__meta" aria-label="Platform summary">
          <span className="proto-cta__meta-label">
            Platform summary
          </span>
          <div className="proto-cta__trace-table" role="table" aria-label="Platform summary">
            <div className="proto-cta__trace-row proto-cta__trace-row--head" role="row">
              <span role="columnheader">
                Phase
              </span>
              <span role="columnheader">
                Signal
              </span>
              <span role="columnheader">
                State
              </span>
            </div>
            <div className="proto-cta__trace-row" role="row">
              <span role="cell" className="proto-cta__trace-phase">
                Interface
              </span>
              <span role="cell" className="proto-cta__trace-signal">
                web app
              </span>
              <span role="cell" className="proto-cta__trace-state" data-tone="orange">
                included
              </span>
            </div>
            <div className="proto-cta__trace-row" role="row">
              <span role="cell" className="proto-cta__trace-phase">
                Desktop
              </span>
              <span role="cell" className="proto-cta__trace-signal">
                Proto
              </span>
              <span role="cell" className="proto-cta__trace-state" data-tone="orange">
                supported
              </span>
            </div>
            <div className="proto-cta__trace-row" role="row">
              <span role="cell" className="proto-cta__trace-phase">
                Access
              </span>
              <span role="cell" className="proto-cta__trace-signal">
                tenant + role
              </span>
              <span role="cell" className="proto-cta__trace-state" data-tone="orange">
                checked
              </span>
            </div>
            <div className="proto-cta__trace-row" role="row">
              <span role="cell" className="proto-cta__trace-phase">
                History
              </span>
              <span role="cell" className="proto-cta__trace-signal">
                by surface
              </span>
              <span role="cell" className="proto-cta__trace-state" data-tone="orange">
                recorded
              </span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
