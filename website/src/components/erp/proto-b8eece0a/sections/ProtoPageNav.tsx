import type { RefObject } from "react";

const LINKS: readonly { href: string; label: string }[] = [
  { href: "#process", label: "Process" },
  { href: "#apps", label: "Apps" },
  { href: "#case-files", label: "Case files" },
  { href: "#approval", label: "Approval" },
  { href: "#tools", label: "Examples" },
];

const HIDDEN = { display: "none" } as const;

type ProtoPageNavProps = {
  navRef: RefObject<HTMLElement | null>;
};

/** m01 — sticky in-page section strip; behaviour comes from usePageNav(navRef). */
export function ProtoPageNav({ navRef }: ProtoPageNavProps) {
  return (
    <nav ref={navRef} className="tacet-page-nav" data-inpage-nav="" data-tacet-page-nav="" aria-label="Agent Harness page sections" data-stuck="false" data-after-content="false">
      <div className="tacet-page-nav__links">
        {LINKS.map((link, index) =>
          index === 0 ? (
            <a key={link.href} href={link.href} className="tacet-page-nav__link inpage-nav-link--active" aria-current="location">
              {link.label}
            </a>
          ) : (
            <a key={link.href} href={link.href} className="tacet-page-nav__link">
              {link.label}
            </a>
          ),
        )}
      </div>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--left" aria-label="Scroll navigation left" style={HIDDEN}>
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className="inpage-nav-arrow inpage-nav-arrow--right" aria-label="Scroll navigation right" style={HIDDEN}>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
