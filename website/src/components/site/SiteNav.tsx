"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EntarisLogo } from "./EntarisLogo";
import { AiraMark } from "./AiraLogo";
import { DEMO_HREF, NAV_ITEMS } from "./siteConfig";

/*
 * Floating top bar in the ERP•AI style: centred rounded bar over a soft wash that gains a surface
 * once the page scrolls. Below 960px the links collapse into a full-width sheet.
 */
export function SiteNav({ home = false }: { home?: boolean } = {}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the sheet is open: Escape closes it, the page behind stops scrolling, and focus moves
  // into the sheet; on close focus returns to the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const toggle = toggleRef.current;
    root.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = previousOverflow;
      toggle?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <div className="ent-nav" data-scrolled={scrolled ? "true" : "false"} data-menu-open={menuOpen ? "true" : "false"}>
        <div className="ent-nav__wash" aria-hidden="true" />
        <nav className="ent-nav__bar" aria-label="Navigasi utama">
          <Link href="/" className="ent-nav__brand" aria-label="Entaris, beranda" onClick={() => setMenuOpen(false)}>
            <EntarisLogo />
          </Link>
          <ul className="ent-nav__links">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="ent-nav__link" aria-current={pathname === item.href ? "page" : undefined}>
                  {item.href === "/aira" && <AiraMark size={15} className="ent-nav__aira-mark" />}
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="ent-nav__actions">
            <Link className="ent-btn ent-btn--solid ent-nav__cta" href={DEMO_HREF}>
              Minta demo
            </Link>
            <button
              ref={toggleRef}
              type="button"
              className="ent-nav__toggle"
              aria-expanded={menuOpen}
              aria-controls="ent-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="ent-nav__toggle-icon" aria-hidden="true">
                <span className="ent-nav__toggle-bar" />
                <span className="ent-nav__toggle-bar" />
              </span>
              <span className="ent-nav__toggle-label">{menuOpen ? "Tutup" : "Menu"}</span>
            </button>
          </div>
        </nav>
      </div>
      <div id="ent-mobile-menu" ref={sheetRef} className="ent-mobile" hidden={!menuOpen}>
        <ul className="ent-mobile__links">
          {NAV_ITEMS.map((item, i) => (
            <li key={item.href}>
              <Link href={item.href} className="ent-mobile__link" aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                <span className="ent-mobile__index">{String(i + 1).padStart(2, "0")}</span>
                <span className="ent-mobile__label">
                  {item.href === "/aira" && <AiraMark size={16} className="ent-nav__aira-mark" />}
                  <span>{item.label}</span>
                </span>
                <span className="ent-mobile__desc">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="ent-btn ent-btn--solid ent-mobile__cta" href={DEMO_HREF} onClick={() => setMenuOpen(false)}>
          Minta demo
        </Link>
      </div>
      {!home && <div className="ent-nav-spacer" aria-hidden="true" />}
    </>
  );
}
