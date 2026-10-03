import type { RefObject } from "react";

const LINKS: readonly { href: string; label: string }[] = [
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#bertanya", label: "Bertanya" },
  { href: "#approval", label: "Draf & approval" },
  { href: "#keamanan", label: "Keamanan" },
  { href: "#contoh", label: "Contoh" },
];

const HIDDEN = { display: "none" } as const;

type AiraPageNavProps = {
  navRef: RefObject<HTMLElement | null>;
};

/** Sticky in-page section strip; behaviour comes from usePageNav(navRef). */
export function AiraPageNav({ navRef }: AiraPageNavProps) {
  return (
    <nav ref={navRef} className="tacet-page-nav" data-inpage-nav="" data-tacet-page-nav="" aria-label="Bagian halaman AIRA" data-stuck="false" data-after-content="false">
      <div className="tacet-page-nav__links">
        {LINKS.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className={index === 0 ? "tacet-page-nav__link inpage-nav-link--active" : "tacet-page-nav__link"}
            aria-current={index === 0 ? "location" : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Geser navigasi ke kiri" style={HIDDEN}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Geser navigasi ke kanan" style={HIDDEN}>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
