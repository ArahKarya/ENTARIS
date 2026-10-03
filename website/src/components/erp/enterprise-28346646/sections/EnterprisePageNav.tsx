/*
 * m01 — sticky in-page nav. Markup is the capture's initial state (first link active, arrows
 * hidden); usePageNav (called by EnterpriseMain on `navRef`) drives the active link, the arrows
 * and data-stuck / data-after-content from then on.
 */
type PageNavLink = { href: `#${string}`; label: string };

const PAGE_NAV_LINKS: readonly PageNavLink[] = [
  { href: "#control-map", label: "Control map" },
  { href: "#policy-path", label: "Policy path" },
  { href: "#deployment-model", label: "Deployment" },
  { href: "#operations-handoff", label: "Operations" },
];

const HIDDEN_ARROW: React.CSSProperties = { display: "none" };

export type EnterprisePageNavProps = {
  navRef: React.Ref<HTMLElement>;
};

export function EnterprisePageNav({ navRef }: EnterprisePageNavProps) {
  return (
    <section ref={navRef} className="proto-page-nav enterprise-page-nav" data-inpage-nav="" data-inpage-accent="org" data-proto-page-nav="" data-stuck="false" data-after-content="false">
      <div className="proto-page-nav__links">
        {PAGE_NAV_LINKS.map((link, index) =>
          index === 0 ? (
            <a key={link.href} href={link.href} className="proto-page-nav__link inpage-nav-link--active" aria-current="location">
              {link.label}
            </a>
          ) : (
            <a key={link.href} href={link.href} className="proto-page-nav__link">
              {link.label}
            </a>
          ),
        )}
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Scroll navigation left" style={HIDDEN_ARROW}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Scroll navigation right" style={HIDDEN_ARROW}>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  );
}
