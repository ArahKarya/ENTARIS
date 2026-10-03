"use client";

import { useRef } from "react";
import { usePageNav } from "../../shared/usePageNav";

const LINKS = [
  ["#workflow-run", "How it runs"],
  ["#apps-plugins", "Apps and Plugins"],
  ["#controls", "Controls"],
  ["#architecture", "Architecture"],
] as const;

/**
 * m01 — sticky in-page anchor strip. Pre-script state (no active link, no data-stuck): usePageNav
 * marks the active link, writes data-stuck / data-after-content and drives the two arrows.
 */
export function PageNavSection() {
  const navRef = useRef<HTMLElement>(null);
  usePageNav(navRef);
  return (
    <nav ref={navRef} className="tacet-page-nav" data-inpage-nav="" data-inpage-accent="org" data-tacet-page-nav="" aria-label="Workflow page sections">
      <div className="tacet-page-nav__links">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className="tacet-page-nav__link">
            {label}
          </a>
        ))}
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Scroll navigation left" style={{ display: "none" }}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Scroll navigation right" style={{ display: "none" }}>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
