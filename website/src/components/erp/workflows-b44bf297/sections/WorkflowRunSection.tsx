"use client";

import { useEffect, useRef } from "react";
import { MiniFlow, SectionEyebrow } from "./MiniFlow";
import { PROCESSES } from "./processData";
import type { WorkflowProcess } from "./types";

const STORY_ROOT_MARGIN = "-32% 0px -32% 0px";
const STORY_THRESHOLDS = [0.15, 0.35, 0.6];
const RECORD_FOOTER = ["Branch: workflow-review", "Version 6", "Nothing released"] as const;

/**
 * Port of workflow-motion.js initStory(): a chapter becomes the active scene on click AND while
 * scrolling (IntersectionObserver over the chapters, -32% vertical root margin, the most visible
 * intersecting chapter wins). Active chapter → `is-active` + its button aria-pressed; record
 * scenes → `hidden` / `is-active`. The `[data-wf-approve]` buttons of the section toggle
 * `is-approved` on their `.wf-record-review` and their label/aria-pressed. The source has no
 * reduced-motion branch here; neither does this port.
 */
function useWorkflowStory(storyRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    story.dataset.wfInitialized = "true";
    const chapters = Array.from(story.querySelectorAll<HTMLElement>("[data-wf-story-target]"));
    const root: ParentNode = story.closest(".wf-section") ?? document;
    const recordScenes = Array.from(root.querySelectorAll<HTMLElement>("[data-wf-record-scene]"));
    const offs: (() => void)[] = [];

    const setScene = (sceneId: string) => {
      chapters.forEach((chapter) => {
        const selected = chapter.dataset.wfStoryTarget === sceneId;
        chapter.classList.toggle("is-active", selected);
        chapter.querySelector("button")?.setAttribute("aria-pressed", String(selected));
      });
      recordScenes.forEach((scene) => {
        const selected = scene.dataset.wfRecordScene === sceneId;
        scene.hidden = !selected;
        scene.classList.toggle("is-active", selected);
      });
    };

    chapters.forEach((chapter) => {
      const button = chapter.querySelector("button");
      if (!button) return;
      const onClick = () => {
        const sceneId = chapter.dataset.wfStoryTarget;
        if (sceneId) setScene(sceneId);
      };
      button.addEventListener("click", onClick);
      offs.push(() => button.removeEventListener("click", onClick));
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          const target = visible?.target;
          const sceneId = target instanceof HTMLElement ? target.dataset.wfStoryTarget : undefined;
          if (sceneId) setScene(sceneId);
        },
        { rootMargin: STORY_ROOT_MARGIN, threshold: STORY_THRESHOLDS },
      );
      chapters.forEach((chapter) => observer.observe(chapter));
      offs.push(() => observer.disconnect());
    }

    root.querySelectorAll<HTMLButtonElement>("[data-wf-approve]").forEach((button) => {
      const onClick = () => {
        const review = button.closest(".wf-record-review");
        const approved = !review?.classList.contains("is-approved");
        review?.classList.toggle("is-approved", approved);
        button.textContent = approved ? "Approved" : "Approve example";
        button.setAttribute("aria-pressed", String(approved));
      };
      button.addEventListener("click", onClick);
      offs.push(() => button.removeEventListener("click", onClick));
    });

    return () => {
      offs.forEach((off) => off());
      delete story.dataset.wfInitialized;
    };
  }, [storyRef]);
}

function StoryChapter({ process, active }: { process: WorkflowProcess; active: boolean }) {
  return (
    <article className={active ? "wf-story__chapter is-active" : "wf-story__chapter"} data-wf-story-target={process.id}>
      <button type="button" aria-pressed={active ? "true" : "false"}>
        <span>{process.num}</span>
        <span>
          <small>{process.area}</small>
          <strong>{process.headline}</strong>
        </span>
      </button>
      <p>{process.summary}</p>
    </article>
  );
}

function ShieldCheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-shield-check ui-icon" data-icon="shield-check" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" />
      <path d="M15 19l2 2l4 -4" />
    </svg>
  );
}

function RecordScene({ process, active }: { process: WorkflowProcess; active: boolean }) {
  return (
    <div className={active ? "wf-record-scene is-active" : "wf-record-scene"} data-wf-record-scene={process.id} hidden={!active}>
      <header>
        <div>
          <span>{process.system}</span>
          <h3>{process.title}</h3>
        </div>
        <span className="wf-record-status">{process.status}</span>
      </header>
      <div className="wf-record-table" role="table" aria-label="Privacy-safe example record">
        <div className="wf-record-table__head" role="row">
          {process.columns.map((column) => (
            <span key={column} role="columnheader">
              {column}
            </span>
          ))}
        </div>
        <div className="wf-record-table__row" role="row">
          {process.cells.map((cell, i) => (
            <strong key={`${i}-${cell}`} role="cell">
              {cell}
            </strong>
          ))}
        </div>
      </div>
      <MiniFlow variant="record" label={`${process.title} workflow`} nodes={process.nodes} />
      <div className="wf-record-review">
        <span>
          <ShieldCheckIcon />
        </span>
        <div>
          <small>Human gate</small>
          <strong>{process.gate}</strong>
          <p>No gated action runs until the assigned reviewer approves it.</p>
        </div>
        <button type="button" data-wf-approve="" aria-pressed="false">
          Approve example
        </button>
      </div>
      <footer>
        {RECORD_FOOTER.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </footer>
    </div>
  );
}

/** m02 — `#workflow-run`: sticky record preview driven by the five story chapters. */
export function WorkflowRunSection() {
  const storyRef = useRef<HTMLDivElement>(null);
  useWorkflowStory(storyRef);
  return (
    <section id="workflow-run" className="wf-section wf-story-section">
      <div className="wf-shell">
        <SectionEyebrow name="Business processes" context="And agent workflows" />
        <div className="wf-section-head">
          <h2>The screen stays put. The process changes.</h2>
          <p>
            Choose a business process or agent workflow, or scroll through the chapters. The run preview keeps the
            record, context, decisions, approvals, and staged actions in one place.
          </p>
        </div>
        <div ref={storyRef} className="wf-story" data-wf-story="">
          <div className="wf-story__chapters">
            {PROCESSES.map((process, i) => (
              <StoryChapter key={process.id} process={process} active={i === 0} />
            ))}
          </div>
          <div className="wf-story__sticky">
            <div className="wf-record-surface" aria-live="polite">
              {PROCESSES.map((process, i) => (
                <RecordScene key={process.id} process={process} active={i === 0} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
