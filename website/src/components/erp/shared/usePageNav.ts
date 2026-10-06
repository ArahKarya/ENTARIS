"use client";

import { useEffect } from "react";

/*
 * Port of inpage-nav-scrollspy.js ("Active state + horizontal-scroll arrows for sticky in-page
 * anchor strips") plus the page-nav part of proto-nav/shell.js (setTacetPageNavState:
 * data-stuck / data-after-content on [data-tacet-page-nav] / [data-proto-page-nav]).
 *
 * USAGE (page builders): keep the draft `<nav|section className="tacet-page-nav|proto-page-nav"
 * data-inpage-nav …>` markup verbatim (including its two `.inpage-nav-arrow` buttons) and put a
 * ref on that element:
 *
 *   const navRef = useRef<HTMLElement>(null);
 *   usePageNav(navRef);
 *   <nav ref={navRef} className="tacet-page-nav" data-inpage-nav="" …>
 *
 * What it drives (same classes/attributes/math as the source):
 * - Active link: `a.inpage-nav-link--active` + aria-current="location" on the link whose target
 *   section top is <= visible strip bottom + 32px (rAF-throttled on scroll; pairs re-resolved on
 *   resize/hashchange). Ambiguous zone keeps the previous marker.
 * - Click on `a[href^="#"]`: scrollIntoView (smooth unless reduced motion), history.replaceState
 *   to the hash, immediate active marking, 1200ms scroll-spy lock, re-sync at 1250ms.
 * - Arrows: reuses the strip's existing `.inpage-nav-arrow--left/--right` buttons (injects them
 *   if the markup has none). style.display "flex"/"none" by overflow + scrollLeft; click scrolls
 *   by clamp(120, 0.7 × clientWidth, 320) smoothly. The active link is kept inside the safe area
 *   between the arrows (8px pad). Updates on scroller scroll, window resize, ResizeObserver,
 *   and data-stuck/data-after-content changes.
 * - Server-rendered aria-current="page" link (cross-page subnavs) is scrolled into view on init.
 * - shell.js: data-stuck = nav.top <= --tacet-nav-bottom + 1; data-after-content = stuck && the
 *   last anchored section's bottom <= --tacet-nav-bottom + 8. --tacet-nav-bottom is read from
 *   the nav's computed style (ProtoNav writes it on `.erp-root`); it is re-evaluated on scroll,
 *   resize and whenever `.erp-root`'s inline style changes (covers the nav bar transition).
 * Everything is removed on unmount.
 */

const ACTIVE_CLASS = "inpage-nav-link--active";
const ACTIVE_LINE_OFFSET = 32;
const SAFE_PAD = 8;
const DEFAULT_ARROW_WIDTH = 40;
const CLICK_LOCK_MS = 1200;
const CLICK_SETTLE_MS = 1250;
const STUCK_SLACK = 1;
const AFTER_CONTENT_SLACK = 8;

type Pair = { link: HTMLAnchorElement; el: HTMLElement };

function findTargetEl(hash: string | null): HTMLElement | null {
  if (!hash || hash.charAt(0) !== "#") return null;
  let id = hash.slice(1);
  if (!id) return null;
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  return document.getElementById(id);
}

function getScroller(nav: HTMLElement): HTMLElement | null {
  for (const child of Array.from(nav.children)) {
    if (child instanceof HTMLDivElement) return child;
  }
  return null;
}

function anchorLinks(nav: HTMLElement): HTMLAnchorElement[] {
  return Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
}

function collectPairs(nav: HTMLElement): Pair[] {
  return anchorLinks(nav).flatMap((link) => {
    const el = findTargetEl(link.getAttribute("href"));
    return el ? [{ link, el }] : [];
  });
}

function ensureActiveVisible(nav: HTMLElement, link: HTMLElement, behavior: ScrollBehavior = "smooth"): void {
  const scroller = getScroller(nav);
  if (!scroller) return;
  const overflow = scroller.scrollWidth - scroller.clientWidth;
  if (overflow <= 1) return;

  const arrow = nav.querySelector(".inpage-nav-arrow");
  const arrowWidth = arrow ? arrow.getBoundingClientRect().width : DEFAULT_ARROW_WIDTH;
  const leftArrowVisible = scroller.scrollLeft > 1;
  const rightArrowVisible = scroller.scrollLeft < overflow - 1;
  const safeLeft = (leftArrowVisible ? arrowWidth : 0) + SAFE_PAD;
  const safeRight = scroller.clientWidth - (rightArrowVisible ? arrowWidth : 0) - SAFE_PAD;

  const scrollerRect = scroller.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const linkLeft = linkRect.left - scrollerRect.left;
  const linkRight = linkRect.right - scrollerRect.left;

  let delta = 0;
  if (linkLeft < safeLeft) delta = linkLeft - safeLeft;
  else if (linkRight > safeRight) delta = linkRight - safeRight;
  if (delta !== 0) scroller.scrollBy({ left: delta, behavior });
}

function setActiveLink(nav: HTMLElement, active: HTMLAnchorElement | null): void {
  const prev = nav.querySelector(`a.${ACTIVE_CLASS}`);
  if (prev === active) return;
  anchorLinks(nav).forEach((a) => {
    if (a === active) {
      a.classList.add(ACTIVE_CLASS);
      a.setAttribute("aria-current", "location");
    } else {
      a.classList.remove(ACTIVE_CLASS);
      a.removeAttribute("aria-current");
    }
  });
  if (active) ensureActiveVisible(nav, active);
}

function getVisibleNavBottom(nav: HTMLElement): number {
  const scroller = getScroller(nav);
  const navRect = nav.getBoundingClientRect();
  if (!scroller) return navRect.bottom;
  const scrollerRect = scroller.getBoundingClientRect();
  if (getComputedStyle(scroller).position === "fixed") return scrollerRect.bottom;
  return Math.max(navRect.bottom, scrollerRect.bottom);
}

function updateFromScroll(nav: HTMLElement, pairs: Pair[]): void {
  if (!pairs.length) return;
  const line = getVisibleNavBottom(nav) + ACTIVE_LINE_OFFSET;
  let current: Pair | null = null;
  for (const pair of pairs) {
    if (pair.el.getBoundingClientRect().top <= line) current = pair;
  }
  if (!current) {
    if (nav.querySelector(`a.${ACTIVE_CLASS}`)) return;
    current = pairs[0];
  }
  setActiveLink(nav, current.link);
}

/** shell.js setTacetPageNavState() for one strip. */
function setStuckState(nav: HTMLElement): void {
  const navBottom = parseFloat(getComputedStyle(nav).getPropertyValue("--tacet-nav-bottom")) || 0;
  const stuck = nav.getBoundingClientRect().top <= navBottom + STUCK_SLACK;
  const links = anchorLinks(nav);
  let lastTarget: HTMLElement | null = null;
  for (let i = links.length - 1; i >= 0 && !lastTarget; i--) {
    lastTarget = findTargetEl(links[i].getAttribute("href"));
  }
  const afterContent =
    stuck && lastTarget ? lastTarget.getBoundingClientRect().bottom <= navBottom + AFTER_CONTENT_SLACK : false;
  const stuckValue = stuck ? "true" : "false";
  const afterValue = afterContent ? "true" : "false";
  // Only write on change so the arrow MutationObserver does not fire every frame.
  if (nav.getAttribute("data-stuck") !== stuckValue) nav.setAttribute("data-stuck", stuckValue);
  if (nav.getAttribute("data-after-content") !== afterValue) nav.setAttribute("data-after-content", afterValue);
}

function getOrCreateArrow(nav: HTMLElement, side: "left" | "right", created: HTMLElement[]): HTMLButtonElement {
  const existing = nav.querySelector<HTMLButtonElement>(`:scope > .inpage-nav-arrow--${side}`);
  if (existing) return existing;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `inpage-nav-arrow inpage-nav-arrow--${side}`;
  btn.setAttribute("aria-label", `Scroll navigation ${side}`);
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = side === "left" ? "‹" : "›";
  btn.appendChild(glyph);
  nav.appendChild(btn);
  created.push(btn);
  return btn;
}

function setupHorizontalScroll(nav: HTMLElement, raf: (cb: () => void) => void): () => void {
  const scroller = getScroller(nav);
  if (!scroller) return () => {};

  const created: HTMLElement[] = [];
  const leftBtn = getOrCreateArrow(nav, "left", created);
  const rightBtn = getOrCreateArrow(nav, "right", created);

  const update = (keepActiveVisible: boolean) => {
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    if (overflow <= 1) {
      leftBtn.style.display = "none";
      rightBtn.style.display = "none";
      return;
    }
    leftBtn.style.display = scroller.scrollLeft > 1 ? "flex" : "none";
    rightBtn.style.display = scroller.scrollLeft < overflow - 1 ? "flex" : "none";
    if (keepActiveVisible) {
      const active = nav.querySelector<HTMLElement>(
        `a.${ACTIVE_CLASS}, a[aria-current="page"], a[aria-current="location"]`,
      );
      if (active) ensureActiveVisible(nav, active, "auto");
    }
  };

  const scrollStep = (direction: 1 | -1) => {
    const step = Math.max(120, Math.min(scroller.clientWidth * 0.7, 320));
    scroller.scrollBy({ left: direction * step, behavior: "smooth" });
  };
  const onLeft = () => scrollStep(-1);
  const onRight = () => scrollStep(1);
  const onScroll = () => update(false);
  const onResize = () => update(true);

  leftBtn.addEventListener("click", onLeft);
  rightBtn.addEventListener("click", onRight);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });

  const stateObserver = new MutationObserver(() => raf(() => update(true)));
  stateObserver.observe(nav, { attributes: true, attributeFilter: ["data-stuck", "data-after-content"] });

  const sizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => update(true)) : null;
  sizeObserver?.observe(scroller);

  raf(() => update(true));

  return () => {
    leftBtn.removeEventListener("click", onLeft);
    rightBtn.removeEventListener("click", onRight);
    scroller.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    stateObserver.disconnect();
    sizeObserver?.disconnect();
    created.forEach((btn) => btn.remove());
  };
}

export function usePageNav(nav: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = nav.current;
    if (!el) return;

    let disposed = false;
    const rafIds = new Set<number>();
    const raf = (cb: () => void): number => {
      const id = requestAnimationFrame(() => {
        rafIds.delete(id);
        if (!disposed) cb();
      });
      rafIds.add(id);
      return id;
    };

    const isStuckNav = el.hasAttribute("data-tacet-page-nav") || el.hasAttribute("data-proto-page-nav");
    const syncStuck = () => {
      if (isStuckNav) setStuckState(el);
    };
    syncStuck();

    let pairs = collectPairs(el);
    const cleanupScroll = setupHorizontalScroll(el, raf);

    const currentPageLink = el.querySelector<HTMLElement>('a[aria-current="page"]');
    if (currentPageLink) raf(() => raf(() => ensureActiveVisible(el, currentPageLink)));

    let clickLockUntil = 0;
    let clickSettleTimer = 0;
    let spyFrame = 0;
    let stuckFrame = 0;

    const schedule = () => {
      if (spyFrame) {
        cancelAnimationFrame(spyFrame);
        rafIds.delete(spyFrame);
      }
      spyFrame = raf(() => {
        spyFrame = 0;
        if (Date.now() < clickLockUntil) return;
        updateFromScroll(el, pairs);
      });
    };
    const scheduleStuck = () => {
      if (stuckFrame) return;
      stuckFrame = raf(() => {
        stuckFrame = 0;
        syncStuck();
      });
    };
    const onScroll = () => {
      scheduleStuck();
      schedule();
    };
    const onStructural = () => {
      pairs = collectPairs(el);
      syncStuck();
      schedule();
    };

    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      if (!a || !el.contains(a)) return;
      const href = a.getAttribute("href");
      const target = findTargetEl(href);
      if (target) {
        e.preventDefault();
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start", inline: "nearest" });
        try {
          window.history.replaceState(window.history.state, "", href);
        } catch {
          /* native hash navigation remains available */
        }
      }
      setActiveLink(el, a);
      clickLockUntil = Date.now() + CLICK_LOCK_MS;
      window.clearTimeout(clickSettleTimer);
      clickSettleTimer = window.setTimeout(schedule, CLICK_SETTLE_MS);
    };

    // ProtoNav rewrites --tacet-nav-bottom on `.erp-root` while its bar transitions; follow it.
    const erpRoot = el.closest(".erp-root");
    const rootVarObserver = erpRoot && isStuckNav ? new MutationObserver(scheduleStuck) : null;
    if (erpRoot) rootVarObserver?.observe(erpRoot, { attributes: true, attributeFilter: ["style"] });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onStructural, { passive: true });
    window.addEventListener("hashchange", onStructural);
    el.addEventListener("click", onClick);

    updateFromScroll(el, pairs);
    // setup(): a second pass two frames later, once layout has settled.
    raf(() => raf(() => updateFromScroll(el, collectPairs(el))));

    return () => {
      disposed = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onStructural);
      window.removeEventListener("hashchange", onStructural);
      el.removeEventListener("click", onClick);
      rootVarObserver?.disconnect();
      window.clearTimeout(clickSettleTimer);
      rafIds.forEach((id) => cancelAnimationFrame(id));
      rafIds.clear();
      cleanupScroll();
    };
  }, [nav]);
}
