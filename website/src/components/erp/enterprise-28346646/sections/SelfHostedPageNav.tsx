/*
 * Sticky in-page nav. Markup is the initial state (first link active, arrows hidden); usePageNav
 * (called by SelfHostedMain on `navRef`) drives the active link, the arrows and data-stuck /
 * data-after-content from then on.
 */
type PageNavLink = { href: `#${string}`; label: string };

const PAGE_NAV_LINKS: readonly PageNavLink[] = [
  { href: "#arsitektur", label: "Arsitektur" },
  { href: "#kontrol", label: "Kontrol" },
  { href: "#opsi-deploy", label: "Opsi deploy" },
  { href: "#operasional", label: "Operasional" },
];

const HIDDEN_ARROW: React.CSSProperties = { display: "none" };

export type SelfHostedPageNavProps = {
  navRef: React.Ref<HTMLElement>;
};

export function SelfHostedPageNav({ navRef }: SelfHostedPageNavProps) {
  return (
    <section ref={navRef} className="proto-page-nav enterprise-page-nav" aria-label="Navigasi halaman" data-inpage-nav="" data-inpage-accent="org" data-proto-page-nav="" data-stuck="false" data-after-content="false">
      <div className="proto-page-nav__links">
        {PAGE_NAV_LINKS.map((link, index) => (
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
