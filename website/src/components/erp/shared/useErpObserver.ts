"use client";

import { useEffect } from "react";

/*
 * Port of observer.js: "Single IntersectionObserver for all scroll-triggered behaviors".
 *
 * USAGE (page builders): keep the draft markup verbatim, give the page's <main> (or any
 * wrapper) a ref and call the hook from the page's client component:
 *
 *   const mainRef = useRef<HTMLElement>(null);
 *   useErpObserver(mainRef);
 *   return <main ref={mainRef}>…draft markup with data-observe="…"…</main>;
 *
 * The drafts were captured after observer.js ran, so they already carry the end-state
 * `observed` class (and the --stagger-index inline vars). On mount the hook strips `observed`
 * from every `[data-observe]` element inside the scope (the pre-script state: the CSS keeps
 * that state fully readable, `.observed` only plays the entrance animation) and then re-adds
 * it one-shot when each element crosses the same threshold the source uses. It is fine to also
 * delete `observed` from the JSX; the hook works either way.
 *
 * Effects (space-separated, stackable, same as the source):
 *   reveal / reveal-up   → .observed
 *   lazy                 → data-src → src
 *   countup              → animates textContent to data-to over 1200ms (ease-out cubic)
 *   stagger              → --stagger-index on each child, then .observed
 *   draw-path            → strokeDasharray/offset = path length on path[data-draw], .observed after 2 rAFs
 *   signature-reveal     → --stagger-index on each [data-line], then .observed
 *   scroll-progress      → continuous --scroll-progress (0..1) while scrolling, then .observed
 *
 * prefers-reduced-motion (live): everything resolves instantly and nothing is observed; turning
 * it on mid-page resolves all pending elements. The observer, the scroll-progress listeners and
 * any count-up rAF chains are torn down on unmount.
 */

type EffectName =
  | "reveal"
  | "reveal-up"
  | "lazy"
  | "countup"
  | "stagger"
  | "draw-path"
  | "signature-reveal"
  | "scroll-progress";

const EFFECT_NAMES: ReadonlySet<string> = new Set<EffectName>([
  "reveal",
  "reveal-up",
  "lazy",
  "countup",
  "stagger",
  "draw-path",
  "signature-reveal",
  "scroll-progress",
]);

/** observer.js thresholdProfiles; declarative [data-observe] elements use the `reveal` profile. */
const THRESHOLD_PROFILES = { reveal: 0.1, "media-hero": 0.18, "media-story": 0.55 } as const;
const OBSERVER_THRESHOLDS = [...new Set(Object.values(THRESHOLD_PROFILES))];
const ROOT_MARGIN = "0px 0px -60px 0px";
const COUNTUP_DURATION_MS = 1200;
const OBSERVED_CLASS = "observed";

function effectsOf(el: Element): EffectName[] {
  return (el.getAttribute("data-observe") ?? "")
    .split(/\s+/)
    .filter((t): t is EffectName => EFFECT_NAMES.has(t));
}

export function useErpObserver(scope: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let disposed = false;

    const pending = new Set<Element>();
    const rafIds = new Set<number>();
    const raf = (cb: FrameRequestCallback): void => {
      const id = requestAnimationFrame((t) => {
        rafIds.delete(id);
        if (!disposed) cb(t);
      });
      rafIds.add(id);
    };

    // -- scroll-progress machinery ------------------------------------------------------------
    const progressEls = new Set<HTMLElement>();
    let progressScheduled = false;
    const progressTick = () => {
      progressScheduled = false;
      if (reducedMotion) {
        progressEls.forEach((el) => el.style.setProperty("--scroll-progress", "1"));
        return;
      }
      const vh = window.innerHeight || document.documentElement.clientHeight;
      progressEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const raw = (vh - rect.top) / (vh + rect.height);
        el.style.setProperty("--scroll-progress", Math.max(0, Math.min(1, raw)).toFixed(4));
      });
    };
    const scheduleProgress = () => {
      if (progressScheduled) return;
      progressScheduled = true;
      raf(progressTick);
    };
    const registerProgress = (el: HTMLElement) => {
      if (progressEls.has(el)) return;
      progressEls.add(el);
      if (progressEls.size === 1) {
        window.addEventListener("scroll", scheduleProgress, { passive: true });
        window.addEventListener("resize", scheduleProgress, { passive: true });
      }
      scheduleProgress();
    };

    // -- count-up -----------------------------------------------------------------------------
    const animateCountUp = (el: HTMLElement, target: number) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (reducedMotion) {
          el.textContent = target.toLocaleString();
          return;
        }
        const progress = Math.min((now - start) / COUNTUP_DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased).toLocaleString();
        if (progress < 1) raf(tick);
      };
      raf(tick);
    };

    // -- effect handlers ----------------------------------------------------------------------
    const runEffect = (type: EffectName, el: HTMLElement) => {
      switch (type) {
        case "reveal":
        case "reveal-up":
          el.classList.add(OBSERVED_CLASS);
          return;
        case "lazy": {
          const src = el.getAttribute("data-src");
          if (src) {
            el.setAttribute("src", src);
            el.removeAttribute("data-src");
          }
          return;
        }
        case "countup": {
          const target = parseInt(el.getAttribute("data-to") ?? "", 10) || 0;
          if (reducedMotion) el.textContent = target.toLocaleString();
          else animateCountUp(el, target);
          return;
        }
        case "stagger":
          Array.from(el.children).forEach((child, i) => {
            if (child instanceof HTMLElement || child instanceof SVGElement) {
              child.style.setProperty("--stagger-index", String(i));
            }
          });
          el.classList.add(OBSERVED_CLASS);
          return;
        case "draw-path":
          if (reducedMotion) {
            el.classList.add(OBSERVED_CLASS);
            return;
          }
          el.querySelectorAll<SVGPathElement>("path[data-draw]").forEach((p) => {
            try {
              const len = p.getTotalLength();
              if (!len) return;
              p.style.strokeDasharray = String(len);
              p.style.strokeDashoffset = String(len);
            } catch {
              // getTotalLength can throw on detached or unsupported paths
            }
          });
          raf(() => raf(() => el.classList.add(OBSERVED_CLASS)));
          return;
        case "signature-reveal":
          el.querySelectorAll<HTMLElement>("[data-line]").forEach((line, i) => {
            line.style.setProperty("--stagger-index", String(i));
          });
          el.classList.add(OBSERVED_CLASS);
          return;
        case "scroll-progress":
          registerProgress(el);
          el.classList.add(OBSERVED_CLASS);
          return;
      }
    };
    const applyAll = (el: HTMLElement) => effectsOf(el).forEach((type) => runEffect(type, el));

    // -- observer -----------------------------------------------------------------------------
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const reached = entry.isIntersecting && entry.intersectionRatio >= THRESHOLD_PROFILES.reveal;
          if (!reached) return;
          const el = entry.target;
          observer.unobserve(el);
          pending.delete(el);
          if (el instanceof HTMLElement) applyAll(el);
        });
      },
      { rootMargin: ROOT_MARGIN, threshold: OBSERVER_THRESHOLDS },
    );

    root.querySelectorAll<HTMLElement>("[data-observe]").forEach((el) => {
      if (reducedMotion) {
        applyAll(el);
        return;
      }
      // Reset the captured end state so the entrance replays on enter, as on the source.
      el.classList.remove(OBSERVED_CLASS);
      pending.add(el);
      observer.observe(el);
    });

    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      if (!reducedMotion) return;
      // observer.js revealAll(): resolve every still-pending element at once.
      pending.forEach((el) => {
        observer.unobserve(el);
        if (el instanceof HTMLElement) applyAll(el);
      });
      pending.clear();
    };
    motionQuery.addEventListener("change", onMotionChange);

    return () => {
      disposed = true;
      observer.disconnect();
      pending.clear();
      motionQuery.removeEventListener("change", onMotionChange);
      if (progressEls.size > 0) {
        window.removeEventListener("scroll", scheduleProgress);
        window.removeEventListener("resize", scheduleProgress);
        progressEls.clear();
      }
      rafIds.forEach((id) => cancelAnimationFrame(id));
      rafIds.clear();
    };
  }, [scope]);
}
