import type { Ref } from "react";

/*
 * Sticky in-page nav. Markup is the initial state (first link active, arrows hidden); usePageNav
 * (called by PageFrame on `navRef`) drives the active link, the arrows and data-stuck /
 * data-after-content from then on.
 */
export type PageNavLink = { href: `#${string}`; label: string };

const HIDDEN_ARROW: React.CSSProperties = { display: "none" };

type PageNavProps = {
  navRef: Ref<HTMLElement>;
  links: readonly PageNavLink[];
  label?: string;
};

export function PageNav({ navRef, links, label = "Navigasi halaman" }: PageNavProps) {
  return (
    <section ref={navRef} className="proto-page-nav enterprise-page-nav" aria-label={label} data-inpage-nav="" data-inpage-accent="org" data-proto-page-nav="" data-stuck="false" data-after-content="false">
      <div className="proto-page-nav__links">
        {links.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className={index === 0 ? "proto-page-nav__link inpage-nav-link--active" : "proto-page-nav__link"}
            aria-current={index === 0 ? "location" : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Geser navigasi ke kiri" style={HIDDEN_ARROW}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Geser navigasi ke kanan" style={HIDDEN_ARROW}>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  );
}
