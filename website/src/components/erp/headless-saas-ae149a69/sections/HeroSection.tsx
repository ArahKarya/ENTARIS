import Link from "next/link";
import type { CSSProperties } from "react";
import { toCloneHref } from "@/components/erp/shared/links";

/** Hero header: eyebrow, headline, lead and the two CTAs. */
export function HeroSection() {
  return (
    <header className="erpai-hero relative border-b border-[var(--border)]" style={{ "--hero-accent": "var(--org)", "--hero-accent-text": "var(--org-on-light)" } as CSSProperties}>
      <div className="hero-bg-prototype hero-bg-prototype--shader" aria-hidden="true" />
      <div className="max-w-[90rem] mx-auto relative erpai-hero__viewport erpai-hero__viewport--fill" style={{ "--hero-extra-bottom": "0px" } as CSSProperties}>
        <div className="grid grid-cols-1 lg:grid-cols-12 w-full relative z-10">
          <div className="erpai-hero__column lg:col-span-12 px-6 lg:px-12 pt-12 pb-14 lg:pt-16 lg:pb-16">
            <div className="proto-section-eyebrow proto-section-eyebrow--underline hero-eyebrow-underline mb-8">
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">
                  ERP.AI platform services
                </span>
                <span className="proto-section-eyebrow__context">
                  Used by the web app, Proto, and approved integrations
                </span>
              </span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-4 uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "0" }}>
              <span className="inline-block">
                 Headless SaaS 
                <span style={{ color: "var(--hero-accent-text)" }}>
                  .
                </span>
              </span>
              <br />
              <span style={{ color: "var(--hero-accent-text)" }}>
                 Business functions beyond one interface 
              </span>
            </h1>
            <p className="text-base md:text-lg max-w-[50ch] leading-relaxed mb-8 pl-6 py-1" style={{ color: "var(--foreground)", fontFamily: "var(--font-body)", borderLeft: "1px solid var(--border)" }}>
               ERP.AI has a full web interface. The same platform services also support Proto, hosted pages, external apps, and approved integrations. 
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="#architecture" className="btn btn--primary btn--xl">
                 See how it works 
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "16px", height: "16px" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M5 12l14 0" />
                  <path d="M13 18l6 -6" />
                  <path d="M13 6l6 6" />
                </svg>
              </a>
              <Link href={toCloneHref("/version-control")} className="btn btn--ghost btn--xl">
                 See version control
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
