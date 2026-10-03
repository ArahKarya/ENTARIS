"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/*
 * Motion for the AIRA page, scoped to `scope`.
 *
 * Hero (`[data-aira-play]`): the server renders the finished conversation. On mount the hook sets
 * data-aira-play="ready" (CSS hides the `[data-seq]` blocks) and flips it to "play" the first
 * time the mockup is 25% visible, which runs the staggered CSS entrance. Skipped entirely under
 * prefers-reduced-motion or without IntersectionObserver, so the static end state stays.
 *
 * Stories (`[data-aira-story]`): the server renders data-step="3" (everything visible). Clicking
 * a `[data-aira-chapter]` sets the story's data-step and aria-pressed. On wide screens (sticky
 * media, ≥ 960px) the step also follows scroll: while the viewport's 52% line is inside the
 * story, the chapter nearest that line wins; a click holds until scroll reaches another chapter.
 * Listeners, the observer and the pending rAF are removed on unmount.
 */

const HERO_THRESHOLD = 0.25;
const SCROLL_ANCHOR = 0.52;
const WIDE_QUERY = "(min-width: 960px)";
const FULL_STEP = "3";

type Story = { el: HTMLElement; chapters: HTMLButtonElement[]; lastAnchor: HTMLButtonElement | null };

const setStep = (story: Story, chapter: HTMLButtonElement): void => {
  story.el.dataset.step = chapter.dataset.step ?? FULL_STEP;
  for (const button of story.chapters) button.setAttribute("aria-pressed", button === chapter ? "true" : "false");
};

const chapterForStep = (story: Story, step: string): HTMLButtonElement | undefined =>
  story.chapters.find((button) => button.dataset.step === step);

function nearestChapter(story: Story, anchor: number): HTMLButtonElement {
  let active = story.chapters[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const button of story.chapters) {
    const rect = button.getBoundingClientRect();
    const next = Math.abs(rect.top + rect.height / 2 - anchor);
    if (next < distance) {
      active = button;
      distance = next;
    }
  }
  return active;
}

function playHero(root: HTMLElement, reducedMotion: boolean): () => void {
  const hero = root.querySelector<HTMLElement>("[data-aira-play]");
  if (!hero || reducedMotion || typeof window.IntersectionObserver !== "function") return () => undefined;
  hero.dataset.airaPlay = "ready";
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      hero.dataset.airaPlay = "play";
      observer.disconnect();
    },
    { threshold: HERO_THRESHOLD },
  );
  observer.observe(hero);
  return () => observer.disconnect();
}

function collectStories(root: HTMLElement): Story[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-aira-story]")).map((el) => ({
    el,
    chapters: Array.from(el.querySelectorAll<HTMLButtonElement>("button[data-aira-chapter]")),
    lastAnchor: null,
  }));
}

export function useAiraMotion(scope: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stopHero = playHero(root, reduced);

    const stories = collectStories(root).filter((story) => story.chapters.length > 0);
    const wide = window.matchMedia(WIDE_QUERY);
    const disposers: (() => void)[] = [];
    let frame = 0;

    const on = (target: EventTarget, type: string, handler: EventListener, opts?: AddEventListenerOptions): void => {
      target.addEventListener(type, handler, opts);
      disposers.push(() => target.removeEventListener(type, handler, opts));
    };

    const syncFromScroll = (): void => {
      frame = 0;
      if (!wide.matches) return;
      const anchor = window.innerHeight * SCROLL_ANCHOR;
      for (const story of stories) {
        const rect = story.el.getBoundingClientRect();
        if (rect.top > anchor || rect.bottom < anchor) continue;
        const active = nearestChapter(story, anchor);
        if (active === story.lastAnchor) continue;
        story.lastAnchor = active;
        setStep(story, active);
      }
    };

    const requestSync = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(syncFromScroll);
    };

    const applyMode = (): void => {
      for (const story of stories) {
        const chapter = chapterForStep(story, wide.matches ? "1" : FULL_STEP);
        story.lastAnchor = null;
        if (chapter) setStep(story, chapter);
      }
      requestSync();
    };

    for (const story of stories) {
      for (const chapter of story.chapters) on(chapter, "click", () => setStep(story, chapter));
    }
    on(window, "scroll", requestSync, { passive: true });
    on(window, "resize", requestSync);
    on(wide, "change", applyMode);
    applyMode();

    return () => {
      stopHero();
      if (frame !== 0) window.cancelAnimationFrame(frame);
      disposers.forEach((dispose) => dispose());
    };
  }, [scope]);
}
