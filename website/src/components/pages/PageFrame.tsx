"use client";

import { useRef, type ReactNode } from "react";
import { useErpObserver } from "@/components/erp/shared/useErpObserver";
import { usePageNav } from "@/components/erp/shared/usePageNav";
import { PageNav, type PageNavLink } from "./PageNav";
import "./pages.css";

type PageFrameProps = {
  /** Optional strip above the hero (e.g. the "sample data" notice). */
  banner?: ReactNode;
  hero: ReactNode;
  /** In-page anchor strip under the hero; omit for single-purpose pages. */
  navLinks?: readonly PageNavLink[];
  navLabel?: string;
  children: ReactNode;
};

/**
 * Shared frame for the marketing sub-pages: <main> with the ported enterprise-page classes,
 * scroll reveals (useErpObserver) and the sticky in-page nav (usePageNav).
 */
export function PageFrame({ banner, hero, navLinks, navLabel, children }: PageFrameProps) {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useErpObserver(mainRef);
  usePageNav(navRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 proto-saas tacet-chrome-page tacet-enterprise-page pg-page">
      {banner}
      {hero}
      {navLinks ? <PageNav navRef={navRef} links={navLinks} label={navLabel} /> : null}
      {children}
    </main>
  );
}
