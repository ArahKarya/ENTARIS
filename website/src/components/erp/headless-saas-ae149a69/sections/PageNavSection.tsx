import type { Ref } from "react";

interface PageNavSectionProps {
  /** Ref for usePageNav (active link, arrows, data-stuck / data-after-content). */
  navRef: Ref<HTMLElement>;
}

/** Sticky in-page anchor strip (driven by usePageNav). */
export function PageNavSection({ navRef }: PageNavSectionProps) {
  return (
    <section ref={navRef} className="tacet-page-nav headless-page-nav" data-inpage-nav="" data-tacet-page-nav="" data-stuck="false" data-after-content="false">
      <div className="tacet-page-nav__links">
        <a href="#the-idea" className="tacet-page-nav__link inpage-nav-link--active" aria-current="location">
           Definition 
        </a>
        <a href="#why-now" className="tacet-page-nav__link">
           Why it matters 
        </a>
        <a href="#architecture" className="tacet-page-nav__link">
           Architecture 
        </a>
        <a href="#agents-users" className="tacet-page-nav__link">
           Clients 
        </a>
        <a href="#real-applications" className="tacet-page-nav__link">
           Capabilities 
        </a>
        <a href="#agent-ecosystem" className="tacet-page-nav__link">
           Callers 
        </a>
        <a href="#old-vs-new" className="tacet-page-nav__link">
           Client model 
        </a>
        <a href="#agent-economy" className="tacet-page-nav__link">
           Request path 
        </a>
        <a href="#advantages" className="tacet-page-nav__link">
           Shared services 
        </a>
        <a href="#thesis" className="tacet-page-nav__link">
           Definition 
        </a>
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Scroll navigation left" style={{ display: "none" }}>
        <span aria-hidden="true">
          ‹
        </span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Scroll navigation right" style={{ display: "none" }}>
        <span aria-hidden="true">
          ›
        </span>
      </button>
    </section>
  );
}
