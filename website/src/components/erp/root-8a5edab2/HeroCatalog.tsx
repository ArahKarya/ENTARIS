"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * header#home-top — the two-panel hero (human layer / agent layer).
 *
 * Behavior ports:
 * - glitch.js: synchronized character scramble across the two [data-glitch] headlines, with
 *   subtitle swaps on the same beat, headline fitting, touch/focus/offscreen/hidden pausing and
 *   prefers-reduced-motion. Constants and algorithm are kept 1:1.
 * - skills-install.js: "Copy prompt" button copies #agent-hero-prompt with a 2s label swap.
 */

// -- glitch.js constants ----------------------------------------------------------------------
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TICK = 42;
const SETTLE_MIN = 2;
const SETTLE_MAX = 5;
const PAUSE = 3000;
const SUB_GLITCH_MS = 120;
const TOUCH_RESUME_MS = 1500;

// -- skills-install.js constants --------------------------------------------------------------
const COPY_RESET_MS = 2000;
const COPY_LABEL = "Copy prompt";
const COPY_SUCCESS_LABEL = "Copied ✓";
const COPY_FALLBACK_LABEL = "Press ⌘C";

const HUMAN_GLITCH =
  "ERP.AI stack,All apps,Business catalog,For humans,Proto workflows,Proto console,App layer,One stack";
const HUMAN_GLITCH_SUB =
  "Every business app. One programmable platform.||Finance, HR, CRM, ops, support, inventory, projects, and more.||Browse the catalog. Pick the systems. Run the business.||Browse the catalog. Pick the systems. Run the business.||Prototype your operating system before you commit to one.||A command center for people who still need judgment and control.||Apps for teams, workflows for operators.||One business layer across the company.";
const AGENT_GLITCH =
  "Headless SaaS,API-first,Agent-ready,For agents,Agent workflows,Agentic ops,API layer,One prompt";
const AGENT_GLITCH_SUB =
  "Business software without trapped screens.||Every app, action, and workflow addressable by code.||Apps described for machines, not scraped from interfaces.||Copy the prompt. Install the skills. Operate the stack.||Prototype agentic workflows before you wire them into operations.||Agentic business with humans in control.||APIs for builders, skills for agents.||One prompt teaches your agent the stack.";

const AGENT_PROMPT = [
  "Install the ERP.AI skills by running this terminal command:",
  "",
  "curl -fsSL https://app.erpai.studio/api/install | bash",
  "",
  "When it finishes, reload your skills so they're available, then read https://app.erpai.studio/api/skills.json to see what each one does.",
  "",
  "Ask me what I'd like to build on ERP.AI and suggest a few ideas to get me started. Plan first, then use the build-app skill to build it end to end. If we need an API key, walk me through creating one at https://app.erpai.studio/apps?settings=api-keys — the installed skills explain where to store it.",
].join("\n");

// -- glitch.js helpers --------------------------------------------------------------------------
type LineRange = { start: number; end: number; text: string };

function getHeadlineLineRanges(text: string): LineRange[] {
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

function parseList(value: string, delimiter: string): string[] {
  return value
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

const PANELS = [
  { words: parseList(HUMAN_GLITCH, ","), subs: parseList(HUMAN_GLITCH_SUB, "||") },
  { words: parseList(AGENT_GLITCH, ","), subs: parseList(AGENT_GLITCH_SUB, "||") },
] as const;

/** Rendered state of one glitch headline + its subtitle. */
type GlitchView = {
  text: string;
  target: string;
  fit: string;
  sub: string;
  subGlitching: boolean;
};

function initialView(index: number): GlitchView {
  const panel = PANELS[index];
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
function startGlitch(
  hero: HTMLElement,
  headlines: HTMLElement[],
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

  const items = PANELS.map((panel, index) => ({
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

// -- Rendering ----------------------------------------------------------------------------------

function GlitchWords({ view }: { view: GlitchView }) {
  const ranges = getHeadlineLineRanges(view.target);
  if (ranges.length <= 1) return <>{view.text}</>;
  return (
    <>
      {ranges.map((range, i) => (
        <span key={i} className="hero-headline__line">
          {view.text.slice(range.start, range.end)}
        </span>
      ))}
    </>
  );
}

function headlineClass(view: GlitchView): string {
  const stacked = getHeadlineLineRanges(view.target).length > 1;
  return "hero-catalog__headline font-display" + (stacked ? " is-stacked" : "");
}

function headlineStyle(view: GlitchView): React.CSSProperties {
  return {
    "--hero-headline-fit": view.fit,
    "--hero-headline-lines": String(getHeadlineLineRanges(view.target).length),
  } as React.CSSProperties;
}

function descriptionClass(view: GlitchView): string {
  return "hero-catalog__description" + (view.subGlitching ? " is-glitching" : "");
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "16px", height: "16px" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    </svg>
  );
}

/** skills-install.js port for the hero's copy button. */
function useCopyPrompt(promptRef: React.RefObject<HTMLPreElement | null>) {
  const [label, setLabel] = useState(COPY_LABEL);
  const resetTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const showLabel = useCallback((next: string) => {
    setLabel(next);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setLabel(COPY_LABEL);
      resetTimer.current = 0;
    }, COPY_RESET_MS);
  }, []);

  const copy = useCallback(() => {
    const target = promptRef.current;
    if (!target) return;
    const text = (target.textContent ?? "").trim();
    const fallback = () => {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      showLabel(COPY_FALLBACK_LABEL);
    };
    if (!navigator.clipboard) {
      fallback();
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => showLabel(COPY_SUCCESS_LABEL))
      .catch(fallback);
  }, [promptRef, showLabel]);

  return { label, copy };
}

export function HeroCatalog() {
  const heroRef = useRef<HTMLElement>(null);
  const humanHeadlineRef = useRef<HTMLHeadingElement>(null);
  const agentHeadlineRef = useRef<HTMLHeadingElement>(null);
  const promptRef = useRef<HTMLPreElement>(null);
  const [views, setViews] = useState<GlitchView[]>(() => [initialView(0), initialView(1)]);
  const { label: copyLabel, copy } = useCopyPrompt(promptRef);

  useEffect(() => {
    const hero = heroRef.current;
    const human = humanHeadlineRef.current;
    const agent = agentHeadlineRef.current;
    if (!hero || !human || !agent) return;
    const update = (index: number, patch: Partial<GlitchView>) => {
      setViews((prev) => prev.map((view, i) => (i === index ? { ...view, ...patch } : view)));
    };
    return startGlitch(hero, [human, agent], update);
  }, []);

  const [human, agent] = views;

  return (
    <header ref={heroRef} id="home-top" className="hero-catalog" aria-label="ERP.AI for humans and agents">
      <div className="hero-catalog__packet" data-hero-catalog="" style={{ "--hero-glare-x": "50%", "--hero-glare-y": "50%" } as React.CSSProperties}>
        <section className="hero-catalog__panel hero-catalog__panel--human" aria-labelledby="hero-human-heading" data-hero-panel="human">
          <div className="hero-catalog__panel-inner">
            <div className="hero-catalog__story hero-catalog__story--human">
              <span className="hero-catalog__eyebrow hero-catalog__eyebrow--human">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-user-check hero-catalog__layer-icon hero-catalog__layer-icon--human" data-icon="user-check" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
                  <path d="M6 21v-2a4 4 0 0 1 4 -4h4" />
                  <path d="M15 19l2 2l4 -4" />
                </svg>
                <span>Human layer</span>
              </span>
              <h1 ref={humanHeadlineRef} id="hero-human-heading" className={headlineClass(human)} style={headlineStyle(human)}>
                <span data-glitch={HUMAN_GLITCH} data-glitch-sub={HUMAN_GLITCH_SUB} aria-label={human.target}>
                  <GlitchWords view={human} />
                </span>
              </h1>
              <p className={descriptionClass(human)} data-glitch-sub-target="">
                {human.sub}
              </p>
            </div>
            <div className="hero-catalog__metric">
              <div className="hero-catalog__metric-box">
                <p>
                  <strong>1 apps</strong>
                  {" across 1 business categories."}
                </p>
                <p>Start with credits. Add seats only when people need them.</p>
              </div>
            </div>
            <a href="https://app.erpai.studio/sign-up" className="hero-catalog__cta">
              <span>Create account</span>
              <ArrowRightIcon />
            </a>
            <ol className="hero-catalog__steps" aria-label="Human onboarding path">
              <li>
                <span>01</span>
                <strong>Sign up</strong>
                <em>Create account</em>
              </li>
              <li>
                <span>02</span>
                <strong>Get key</strong>
                <em>Create one key</em>
              </li>
              <li>
                <span>03</span>
                <strong>Hand off</strong>
                <em>Share the manifest</em>
              </li>
            </ol>
          </div>
        </section>
        <section className="hero-catalog__panel hero-catalog__panel--agent" aria-labelledby="hero-agent-heading" data-hero-panel="agent">
          <div className="hero-catalog__panel-inner">
            <div className="hero-catalog__story hero-catalog__story--agent">
              <span className="hero-catalog__eyebrow hero-catalog__eyebrow--agent">
                <span>Agent layer</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-click hero-catalog__layer-icon hero-catalog__layer-icon--agent" data-icon="click" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M3 12l3 0" />
                  <path d="M12 3l0 3" />
                  <path d="M7.8 7.8l-2.2 -2.2" />
                  <path d="M16.2 7.8l2.2 -2.2" />
                  <path d="M7.8 16.2l-2.2 2.2" />
                  <path d="M12 12l9 3l-4 2l-2 4l-3 -9" />
                </svg>
              </span>
              <h2 ref={agentHeadlineRef} id="hero-agent-heading" className={headlineClass(agent)} style={headlineStyle(agent)}>
                <span data-glitch={AGENT_GLITCH} data-glitch-sub={AGENT_GLITCH_SUB} aria-label={agent.target}>
                  <GlitchWords view={agent} />
                </span>
              </h2>
              <p className={descriptionClass(agent)} data-glitch-sub-target="">
                {agent.sub}
              </p>
            </div>
            <div className="hero-catalog__metric">
              <div className="hero-catalog__metric-box">
                <p>
                  <strong>Every skill</strong>
                  {" your agent needs to build here."}
                </p>
                <p>Copy the prompt below into your agent, start building.</p>
              </div>
            </div>
            <pre ref={promptRef} id="agent-hero-prompt" hidden>
              {AGENT_PROMPT}
            </pre>
            <button type="button" className="hero-catalog__cta skills-copy-btn" data-copy-target="#agent-hero-prompt" aria-label="Copy the agent setup prompt to clipboard" onClick={copy}>
              <span className="hero-catalog__cta-group">
                <span data-copy-label="">{copyLabel}</span>
                <ArrowRightIcon />
              </span>
            </button>
            <ol className="hero-catalog__steps" aria-label="Agent onboarding path">
              <li>
                <span>01</span>
                <strong>Copy prompt</strong>
                <em>Paste into your agent</em>
              </li>
              <li>
                <span>02</span>
                <strong>Skills install</strong>
                <em>Builder skills load</em>
              </li>
              <li>
                <span>03</span>
                <strong>Build</strong>
                <em>Tell it what to build</em>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </header>
  );
}
