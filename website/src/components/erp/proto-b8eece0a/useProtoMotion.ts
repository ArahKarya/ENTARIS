"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/*
 * Port of proto-motion-video.js, scoped to `scope` (every `[data-proto-motion]` inside it).
 *
 * - Each figure's `.tacet-proto-motion__frame` is watched by one IntersectionObserver with the
 *   observer.js options (rootMargin "0px 0px -60px 0px", thresholds 0.1/0.18/0.55). Visible =
 *   isIntersecting && ratio >= profile ratio: 'media-hero' 0.18 for `.tacet-proto-motion--hero`,
 *   'media-story' 0.55 otherwise. Visible → play (unless reduced motion or manually paused),
 *   otherwise pause. Without IntersectionObserver the videos stay paused.
 * - Toggle button: textContent "Play"/"Pause" + aria-label "Play video"/"Pause video"; a manual
 *   pause sticks until the toggle or a chapter is clicked again.
 * - `data-proto-motion-autostart` seeks to that fraction once metadata is known.
 * - Chapters: click seeks to duration × data-position and plays; aria-pressed follows
 *   currentTime (timeupdate, +0.02 slack) unless the story is "scroll-controlled": while the
 *   viewport's 52% line is inside the story, the chapter nearest that line (or, for a horizontal
 *   chapter row, the story's scroll progress) is pressed and the video seeks to it.
 * - prefers-reduced-motion (live): turning it on pauses every video.
 * Listeners, the observer and the pending rAF are removed on unmount; videos are paused.
 */

const ROOT_MARGIN = "0px 0px -60px 0px";
const THRESHOLDS = [0.1, 0.18, 0.55];
const RATIO_HERO = 0.18;
const RATIO_STORY = 0.55;
const SCROLL_ANCHOR = 0.52;
const CHAPTER_SLACK = 0.02;
const END_GUARD = 0.05;

type Figure = {
  el: HTMLElement;
  video: HTMLVideoElement;
  toggle: HTMLButtonElement | null;
  chapters: HTMLButtonElement[];
  minRatio: number;
};

const clampTime = (video: HTMLVideoElement, position: number): number =>
  Math.min(Math.max(0, video.duration * position), Math.max(0, video.duration - END_GUARD));

const setState = (figure: Figure, playing: boolean): void => {
  if (!figure.toggle) return;
  figure.toggle.textContent = playing ? "Pause" : "Play";
  figure.toggle.setAttribute("aria-label", playing ? "Pause video" : "Play video");
};

const activateChapter = (figure: Figure, active: HTMLButtonElement): void => {
  for (const button of figure.chapters) {
    const pressed = button === active ? "true" : "false";
    if (button.getAttribute("aria-pressed") !== pressed) button.setAttribute("aria-pressed", pressed);
  }
};

const seekToChapter = (figure: Figure, chapter: HTMLButtonElement): boolean => {
  const position = Number(chapter.dataset.position ?? 0);
  if (!Number.isFinite(position) || !Number.isFinite(figure.video.duration)) return false;
  figure.video.currentTime = clampTime(figure.video, position);
  activateChapter(figure, chapter);
  return true;
};

function collectFigures(root: HTMLElement): Figure[] {
  const figures: Figure[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-proto-motion]"))) {
    const video = el.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) continue;
    const toggle = el.querySelector("[data-proto-motion-toggle]");
    figures.push({
      el,
      video,
      toggle: toggle instanceof HTMLButtonElement ? toggle : null,
      chapters: Array.from(el.querySelectorAll("[data-proto-motion-chapter]")).filter(
        (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
      ),
      minRatio: el.classList.contains("tacet-proto-motion--hero") ? RATIO_HERO : RATIO_STORY,
    });
  }
  return figures;
}

/** The chapter the scroll anchor points at (proto-motion-video.js syncStoryFromScroll). */
function chapterAtAnchor(figure: Figure, storyRect: DOMRect, anchor: number): HTMLButtonElement {
  const buttons = figure.chapters;
  const rects = buttons.map((button) => button.getBoundingClientRect());
  const centers = rects.map((rect) => rect.top + rect.height / 2);
  const spread = Math.max(...centers) - Math.min(...centers);
  const tallest = Math.max(...rects.map((rect) => rect.height));
  if (spread < tallest * 0.6) {
    const progress = Math.min(0.999, Math.max(0, (anchor - storyRect.top) / storyRect.height));
    return buttons[Math.floor(progress * buttons.length)];
  }
  let active = buttons[0];
  let distance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const next = Math.abs(center - anchor);
    if (next < distance) {
      active = buttons[index];
      distance = next;
    }
  });
  return active;
}

export function useProtoMotion(scope: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;
    const figures = collectFigures(root);
    if (figures.length === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const manuallyPaused = new WeakSet<HTMLVideoElement>();
    const scrollControlled = new WeakSet<Figure>();
    const scrollChapter = new WeakMap<Figure, HTMLButtonElement>();
    const disposers: (() => void)[] = [];
    let scrollFrame = 0;
    let alive = true;

    const on = (target: EventTarget, type: string, handler: EventListener, opts?: AddEventListenerOptions): void => {
      target.addEventListener(type, handler, opts);
      disposers.push(() => target.removeEventListener(type, handler, opts));
    };

    const setActiveChapter = (figure: Figure): void => {
      if (scrollControlled.has(figure)) return;
      const { chapters, video } = figure;
      if (chapters.length === 0 || !Number.isFinite(video.duration)) return;
      const progress = video.duration > 0 ? video.currentTime / video.duration : 0;
      let active = chapters[0];
      for (const button of chapters) {
        if (Number(button.dataset.position ?? 0) <= progress + CHAPTER_SLACK) active = button;
      }
      activateChapter(figure, active);
    };

    const syncStoryFromScroll = (figure: Figure): void => {
      if (figure.chapters.length === 0) return;
      const storyRect = figure.el.getBoundingClientRect();
      const anchor = window.innerHeight * SCROLL_ANCHOR;
      if (!(storyRect.top <= anchor && storyRect.bottom >= anchor)) {
        scrollControlled.delete(figure);
        scrollChapter.delete(figure);
        setActiveChapter(figure);
        return;
      }
      scrollControlled.add(figure);
      const active = chapterAtAnchor(figure, storyRect, anchor);
      activateChapter(figure, active);
      if (scrollChapter.get(figure) === active) return;
      if (seekToChapter(figure, active)) scrollChapter.set(figure, active);
    };

    const requestScrollSync = (): void => {
      if (scrollFrame !== 0) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        figures.forEach(syncStoryFromScroll);
      });
    };

    const play = async (figure: Figure): Promise<void> => {
      const { video } = figure;
      if (reducedMotion.matches || manuallyPaused.has(video)) {
        video.pause();
        setState(figure, false);
        return;
      }
      try {
        await video.play();
        if (alive) setState(figure, true);
      } catch {
        if (alive) setState(figure, false);
      }
    };

    const pause = (figure: Figure): void => {
      figure.video.pause();
      setState(figure, false);
    };

    const byTarget = new Map<Element, Figure>();
    const observer =
      typeof window.IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const figure = byTarget.get(entry.target);
                if (!figure) continue;
                if (entry.isIntersecting && entry.intersectionRatio >= figure.minRatio) void play(figure);
                else pause(figure);
              }
            },
            { rootMargin: ROOT_MARGIN, threshold: THRESHOLDS },
          )
        : null;

    for (const figure of figures) {
      const { video, toggle, chapters } = figure;
      video.muted = true;
      setState(figure, false);
      if (observer) {
        const target = figure.el.querySelector(".tacet-proto-motion__frame") ?? figure.el;
        byTarget.set(target, figure);
        observer.observe(target);
      } else {
        video.pause();
      }

      const applyAutostart = (): void => {
        const position = Number(video.dataset.protoMotionAutostart);
        if (!Number.isFinite(position) || !Number.isFinite(video.duration)) return;
        video.currentTime = clampTime(video, position);
        delete video.dataset.protoMotionAutostart;
        setActiveChapter(figure);
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) applyAutostart();
      else on(video, "loadedmetadata", applyAutostart, { once: true });

      if (toggle) {
        on(toggle, "click", () => {
          if (video.paused) {
            manuallyPaused.delete(video);
            void play(figure);
          } else {
            manuallyPaused.add(video);
            pause(figure);
          }
        });
      }

      for (const chapter of chapters) {
        on(chapter, "click", () => {
          const seek = (): void => {
            if (!seekToChapter(figure, chapter)) return;
            scrollChapter.set(figure, chapter);
            manuallyPaused.delete(video);
            void play(figure);
          };
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
          else on(video, "loadedmetadata", seek, { once: true });
        });
      }

      on(video, "loadedmetadata", () => {
        setActiveChapter(figure);
        requestScrollSync();
      });
      on(video, "timeupdate", () => setActiveChapter(figure));
    }

    on(window, "scroll", requestScrollSync, { passive: true });
    on(window, "resize", requestScrollSync);
    on(reducedMotion, "change", () => {
      if (reducedMotion.matches) figures.forEach(pause);
    });
    requestScrollSync();

    return () => {
      alive = false;
      if (scrollFrame !== 0) window.cancelAnimationFrame(scrollFrame);
      observer?.disconnect();
      disposers.forEach((dispose) => dispose());
      figures.forEach((figure) => figure.video.pause());
    };
  }, [scope]);
}
