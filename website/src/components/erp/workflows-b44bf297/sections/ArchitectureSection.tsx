"use client";

import { useRef } from "react";
import { useErpRoot } from "../../shared/ErpRoot";
import { useErpObserver } from "../../shared/useErpObserver";
import { SectionEyebrow } from "./MiniFlow";
import { ProtoDiagramCanvas } from "./ProtoDiagramCanvas";
import { ProtoDiagramModal } from "./ProtoDiagramModal";
import { useDiagramModal, useDiagramScrollReveal } from "./useProtoDiagram";

const DIAGRAM_LABEL = "How Proto Works";

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-search" data-icon="search" aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
      <path d="M21 21l-6 -6" />
    </svg>
  );
}

/**
 * m05 — `#architecture`: the "How Proto Works" diagram (observer.js reveals + proto-diagram-zoom.js
 * reading-zone state and zoom dialog). Pre-script markup: the shell carries only
 * data-proto-diagram + data-diagram-label; the hooks add the data-diagram-* state.
 */
export function ArchitectureSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const { rootRef } = useErpRoot();
  useErpObserver(sectionRef);
  useDiagramScrollReveal(shellRef);
  const { modalHost, modalRef, openModal } = useDiagramModal(shellRef, rootRef);

  return (
    <section ref={sectionRef} id="architecture" className="border-b border-[var(--border)]" style={{ background: "var(--card)" }}>
      <div className="py-12 px-6 lg:px-12" data-observe="reveal-up">
        <SectionEyebrow name="Architecture" context="Input, engine, output" underline={false} />
        <h2 className="font-heading text-[clamp(2rem,4vw,3rem)] uppercase leading-none mb-10" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
          {DIAGRAM_LABEL}
        </h2>
        <div ref={shellRef} className="proto-diagram-shell" data-proto-diagram="" data-diagram-label={DIAGRAM_LABEL}>
          <div className="proto-diagram-toolbar">
            <div className="proto-diagram-toolbar__controls" aria-label="How Proto Works diagram controls">
              <button type="button" data-diagram-action="open" aria-label="Open How Proto Works diagram viewer" onClick={openModal}>
                <SearchIcon />
                <span>Expand How Proto Works</span>
              </button>
            </div>
          </div>
          <div className="proto-diagram-viewport" data-proto-diagram-viewport="">
            <div className="proto-diagram-canvas" data-proto-diagram-canvas="">
              <ProtoDiagramCanvas />
            </div>
          </div>
        </div>
      </div>
      {modalHost && <ProtoDiagramModal host={modalHost} ref={modalRef} />}
    </section>
  );
}
