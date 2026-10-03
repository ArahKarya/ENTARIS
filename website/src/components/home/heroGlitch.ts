/*
 * Headline scramble for the home hero (port of the source glitch.js): synchronized character
 * scramble across the two headlines, subtitle swaps on the same beat, headline fitting, and
 * touch/focus/offscreen/hidden pausing. Honors prefers-reduced-motion.
 */

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TICK = 42;
const SETTLE_MIN = 2;
const SETTLE_MAX = 5;
const PAUSE = 3000;
const SUB_GLITCH_MS = 120;
const TOUCH_RESUME_MS = 1500;

export type LineRange = { start: number; end: number; text: string };

export function getHeadlineLineRanges(text: string): LineRange[] {
  const ranges: LineRange[] = [];
  const re = /[^\s-]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return ranges.length ? ranges : [{ start: 0, end: text.length, text }];
}

function isHeadlineSeparator(char: string): boolean {
  return /[\s-]/.test(char);
}

/** One hero panel: headline words and the subtitle shown with each word (same length). */
export type GlitchPanel = { readonly words: readonly string[]; readonly subs: readonly string[] };

/** Rendered state of one glitch headline + its subtitle. */
export type GlitchView = {
  text: string;
  target: string;
  fit: string;
  sub: string;
  subGlitching: boolean;
};

export function initialView(panel: GlitchPanel): GlitchView {
  return { text: panel.words[0], target: panel.words[0], fit: "1.000", sub: panel.subs[0], subGlitching: false };
}

/** setHeadlineLayout: imperative mirror so measurements see the target layout immediately. */
function applyHeadlineLayout(headline: HTMLElement, target: string): void {
  const lineCount = getHeadlineLineRanges(target).length;
  headline.classList.toggle("is-stacked", lineCount > 1);
  headline.style.setProperty("--hero-headline-lines", String(lineCount));
}

/** fitHeadline: measures the target words in a hidden probe and returns the fit factor. */
function measureFit(headline: HTMLElement, target: string): string {
  const ranges = getHeadlineLineRanges(target);
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.className = "hero-headline__probe";
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:nowrap;width:max-content;inset:0 auto auto 0;pointer-events:none;";
  ranges.forEach((range) => {
    const line = document.createElement("span");
    line.className = "hero-headline__line";
    line.textContent = range.text;
    probe.appendChild(line);
  });

  headline.style.setProperty("--hero-headline-fit", "1");
  applyHeadlineLayout(headline, target);
  headline.appendChild(probe);

  const available = headline.clientWidth;
  const needed = Math.max(probe.scrollWidth, probe.getBoundingClientRect().width);
  const minFit = ranges.length > 1 ? 0.68 : 0.58;
  const fit = needed > available ? Math.max(minFit, (available / needed) * 0.985) : 1;

  probe.remove();
  const value = fit.toFixed(3);
  headline.style.setProperty("--hero-headline-fit", value);
  return value;
}

type ScrambleController = { settle: () => void };

/** Port of glitch.js init(): owns all timers/listeners and reports rendering through `update`. */
export function startGlitch(
  hero: HTMLElement,
  headlines: HTMLElement[],
  panels: readonly GlitchPanel[],
  update: (index: number, patch: Partial<GlitchView>) => void,
): () => void {
  const timers = new Set<number>();
  const intervals = new Set<number>();
  const cleanups: Array<() => void> = [];

  const later = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  type ListenMap = HTMLElementEventMap & DocumentEventMap;
  const listen = <K extends keyof ListenMap>(
    target: HTMLElement | Document | Window,
    type: K,
    fn: (event: ListenMap[K]) => void,
  ): void => {
    const handler = fn as EventListener;
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const items = panels.map((panel, index) => ({
    index,
    headline: headlines[index],
    words: panel.words,
    subs: panel.subs,
    subText: panel.subs[0],
    currentTarget: panel.words[0],
  }));
  type Item = (typeof items)[number];

  const fit = (item: Item, target: string) => update(item.index, { fit: measureFit(item.headline, target) });
  const render = (item: Item, text: string, target: string) => {
    applyHeadlineLayout(item.headline, target);
    update(item.index, { text, target });
  };

  function setSubtitle(item: Item, index: number, immediate: boolean): void {
    if (!item.subs.length) return;
    const next = item.subs[index % item.subs.length];
    if (!next || item.subText === next) return;
    if (immediate) {
      item.subText = next;
      update(item.index, { sub: next });
      return;
    }
    update(item.index, { subGlitching: true });
    later(() => {
      item.subText = next;
      update(item.index, { sub: next, subGlitching: false });
    }, SUB_GLITCH_MS);
  }

  function scrambleItem(item: Item, index: number, onSettled: () => void): ScrambleController {
    const target = item.words[index % item.words.length];
    item.currentTarget = target;
    setSubtitle(item, index, false);
    fit(item, target);

    const len = target.length;
    const settled = new Array<boolean>(len).fill(false);
    const counts: number[] = [];
    for (let i = 0; i < len; i++) {
      counts.push(SETTLE_MIN + Math.floor(Math.random() * (SETTLE_MAX - SETTLE_MIN)));
    }
    const ticks = new Array<number>(len).fill(0);
    let finished = false;

    const intervalId = window.setInterval(() => {
      let text = "";
      let allDone = true;
      for (let j = 0; j < len; j++) {
        if (isHeadlineSeparator(target[j])) {
          settled[j] = true;
          text += target[j];
        } else if (settled[j]) {
          text += target[j];
        } else {
          ticks[j]++;
          if (ticks[j] >= counts[j]) {
            settled[j] = true;
            text += target[j];
          } else {
            text += CHARS[Math.floor(Math.random() * CHARS.length)];
            allDone = false;
          }
        }
      }
      render(item, text, target);
      if (allDone) finish(false);
    }, TICK);
    intervals.add(intervalId);

    function finish(immediate: boolean): void {
      if (finished) return;
      finished = true;
      window.clearInterval(intervalId);
      intervals.delete(intervalId);
      if (immediate) {
        setSubtitle(item, index, true);
        render(item, target, target);
      }
      onSettled();
    }

    return { settle: () => finish(true) };
  }

  // Initial render (words[0]) + refit on resize and font load.
  items.forEach((item) => {
    const refitCurrent = () => {
      if (!item.headline.isConnected) return;
      fit(item, item.currentTarget);
    };
    fit(item, item.currentTarget);
    render(item, item.currentTarget, item.currentTarget);
    setSubtitle(item, 0, true);
    listen(window, "resize", refitCurrent);
    if (document.fonts && typeof document.fonts.load === "function") {
      document.fonts
        .load('700 1em "Clash Grotesk"')
        .then(refitCurrent)
        .catch(() => {});
    }
  });

  const teardown = () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    intervals.forEach((id) => window.clearInterval(id));
    intervals.clear();
    cleanups.forEach((fn) => fn());
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return teardown;
  if (!items.some((item) => item.words.length > 1)) return teardown;

  const maxLength = Math.max(...items.map((item) => item.words.length));
  let current = 0;
  let cycleTimeout = 0;
  const pauseReasons = new Set<string>();
  let scrambling = false;
  let touchResumeTimeout = 0;
  let activeScrambles: ScrambleController[] = [];

  function clearCycleTimeout(): void {
    if (!cycleTimeout) return;
    window.clearTimeout(cycleTimeout);
    timers.delete(cycleTimeout);
    cycleTimeout = 0;
  }

  function scheduleNext(): void {
    if (pauseReasons.size || scrambling || document.hidden || cycleTimeout) return;
    cycleTimeout = later(next, PAUSE);
  }

  function next(): void {
    cycleTimeout = 0;
    if (pauseReasons.size || document.hidden) return;
    current = (current + 1) % maxLength;
    scrambling = true;
    let unsettled = items.length;
    activeScrambles = items.map((item) =>
      scrambleItem(item, current, () => {
        unsettled--;
        if (unsettled > 0) return;
        scrambling = false;
        activeScrambles = [];
        scheduleNext();
      }),
    );
  }

  function settleActiveScramble(): void {
    if (!activeScrambles.length) return;
    const controllers = activeScrambles.slice();
    activeScrambles = [];
    controllers.forEach((controller) => controller.settle());
  }

  function requestPause(reason: string): void {
    pauseReasons.add(reason);
    clearCycleTimeout();
    settleActiveScramble();
  }

  function resume(reason: string): void {
    pauseReasons.delete(reason);
    scheduleNext();
  }

  function handleVisibility(): void {
    if (document.hidden) requestPause("document-hidden");
    else resume("document-hidden");
  }

  listen(hero, "focusin", () => requestPause("focus"));
  listen(hero, "focusout", (event) => {
    if (!hero.contains(event.relatedTarget as Node | null)) resume("focus");
  });
  listen(hero, "touchstart", () => requestPause("touch"));
  listen(hero, "touchend", () => {
    if (touchResumeTimeout) {
      window.clearTimeout(touchResumeTimeout);
      timers.delete(touchResumeTimeout);
    }
    touchResumeTimeout = later(() => resume("touch"), TOUCH_RESUME_MS);
  });
  listen(hero, "touchcancel", () => resume("touch"));

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        if (visible) resume("offscreen");
        else requestPause("offscreen");
      },
      { threshold: [0, 0.05] },
    );
    observer.observe(hero);
    cleanups.push(() => observer.disconnect());
  }

  listen(document, "visibilitychange", handleVisibility);
  handleVisibility();
  scheduleNext();

  return teardown;
}
