"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { themeStore, type ErpTheme } from "./theme";

/*
 * Page runtime ported from the ERP•AI site. The source keeps page state on <html> and <body>
 * (theme class, data-home-category-view, CSS variables written by its scripts); the scoped CSS
 * maps html/body to `.erp-root`, so this component owns that element and exposes the state.
 *
 * Also ports site-footer.js layout: the footer is a fixed "reveal" under the page shell when it
 * fits in the viewport, otherwise it flows (data-site-footer-layout + --footer-height).
 */
export type CategoryView = "all" | "selected";

type ErpRootContext = {
  theme: ErpTheme;
  themeExplicit: boolean;
  setTheme: (theme: ErpTheme) => void;
  categoryView: CategoryView;
  setCategoryView: (view: CategoryView) => void;
  /** Writes a CSS custom property on the root (the source writes them on <html>). */
  setRootVar: (name: `--${string}`, value: string | null) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

const Ctx = createContext<ErpRootContext | null>(null);

export function useErpRoot(): ErpRootContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useErpRoot must be used inside <ErpRoot>");
  return ctx;
}

type Props = {
  /** Children rendered inside `.page-shell` (nav, overlays, hero, main, footer). */
  children: React.ReactNode;
  /** Siblings of the page shell (cookie banner, dialogs). */
  outside?: React.ReactNode;
  initialCategoryView?: CategoryView;
  /** The home page carries `data-home-category-view` on <html>; subpages do not. */
  home?: boolean;
};

export function ErpRoot({ children, outside, initialCategoryView = "all", home = true }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const { theme, explicit: themeExplicit } = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const [categoryView, setCategoryView] = useState<CategoryView>(initialCategoryView);
  const [footerLayout, setFooterLayout] = useState<"reveal" | "flow">("reveal");

  // theme-boot.js runs before paint on the source; here the stored preference is applied on
  // hydration (useSyncExternalStore swaps the "light" server snapshot for the client one).
  const setTheme = useCallback((t: ErpTheme) => {
    themeStore.set(t);
    document.dispatchEvent(new CustomEvent("site-theme-change", { detail: { dark: t === "dark" } }));
  }, []);

  const setRootVar = useCallback((name: `--${string}`, value: string | null) => {
    const el = rootRef.current;
    if (!el) return;
    if (value === null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
  }, []);

  // site-footer.js measureFooter(): reveal when the footer fits in the visual viewport.
  useEffect(() => {
    const root = rootRef.current;
    const footer = root?.querySelector<HTMLElement>("footer.site-footer");
    if (!root || !footer) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = footer.getBoundingClientRect();
      const height = Math.ceil(Math.max(bounds.height, footer.offsetHeight, footer.scrollHeight, 0));
      const viewport = Math.floor(window.visualViewport?.height ?? window.innerHeight);
      const layout = height > viewport ? "flow" : "reveal";
      setFooterLayout(layout);
      root.style.setProperty("--footer-height", layout === "reveal" ? `${height}px` : "0px");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(footer);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const value = useMemo(
    () => ({ theme, themeExplicit, setTheme, categoryView, setCategoryView, setRootVar, rootRef }),
    [theme, themeExplicit, setTheme, categoryView, setRootVar],
  );

  return (
    <Ctx.Provider value={value}>
      <div
        id="erp-root"
        ref={rootRef}
        className={`erp-root flex flex-stack min-h-screen bg-background text-foreground has-site-footer${theme === "dark" ? " dark" : ""}`}
        data-home-category-view={home ? categoryView : undefined}
        data-proto-modules="topology"
      >
        <a className="skip-link" href="#main-content">
          Lewati ke konten
        </a>
        <div ref={shellRef} className="page-shell page-shell--footer-tacet" data-site-footer-layout={footerLayout}>
          {children}
        </div>
        {outside}
      </div>
    </Ctx.Provider>
  );
}
