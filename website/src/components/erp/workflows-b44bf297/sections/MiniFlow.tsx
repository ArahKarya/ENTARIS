"use client";

import { Fragment, useEffect, useRef } from "react";
import type { MiniFlowVariant, MiniNode } from "./types";

export const WF_ICONS = "/assets/assets/images/workflow-ui-icons.svg";
export const PLUGIN_LOGOS = "/assets/assets/images/plugin-logos.svg";

/** `<svg class="wf-ui-icon"><use href="workflow-ui-icons.svg#workflow-icon-…">` */
export function WfIcon({ name }: { name: string }) {
  return (
    <svg className="wf-ui-icon" aria-hidden="true">
      <use href={`${WF_ICONS}#workflow-icon-${name}`} />
    </svg>
  );
}

function MiniNodeButton({ node }: { node: MiniNode }) {
  return (
    <button type="button" className={`wf-mini-node wf-mini-node--${node.kind}`} data-wf-mini-node="" aria-expanded="false">
      <span className="wf-mini-node__main">
        <i aria-hidden="true">
          <WfIcon name={node.icon} />
        </i>
        <span className="wf-mini-node__title">
          <strong>{node.title}</strong>
          <small>{node.label}</small>
        </span>
        <span className="wf-mini-node__toggle" aria-hidden="true">
          <WfIcon name="arrow-right" />
        </span>
      </span>
      <span className="wf-mini-node__context">{node.context}</span>
      <span className="wf-mini-node__footer">
        <span>{node.footer}</span>
        <span>
          <i aria-hidden="true" />
          {node.status}
        </span>
      </span>
      <span className="wf-mini-node__details" data-wf-mini-node-details="" hidden>
        {node.details.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </span>
    </button>
  );
}

/**
 * Port of workflow-motion.js initMiniFlow(): clicking a node opens it (closing the others) or
 * closes it when already open — `is-open`, aria-expanded and the details' `hidden`; Escape inside
 * the flow closes the open node and refocuses it. Same `data-wf-initialized` marker as the source.
 */
function useMiniFlow(ref: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const flow = ref.current;
    if (!flow) return;
    flow.dataset.wfInitialized = "true";
    const nodes = Array.from(flow.querySelectorAll<HTMLElement>("[data-wf-mini-node]"));
    const setNodeOpen = (node: HTMLElement, open: boolean) => {
      node.classList.toggle("is-open", open);
      node.setAttribute("aria-expanded", String(open));
      const details = node.querySelector<HTMLElement>("[data-wf-mini-node-details]");
      if (details) details.hidden = !open;
    };
    const handlers = nodes.map((target) => {
      const onClick = () => {
        nodes.forEach((node) => setNodeOpen(node, node === target && !node.classList.contains("is-open")));
      };
      target.addEventListener("click", onClick);
      return () => target.removeEventListener("click", onClick);
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const openNode = nodes.find((node) => node.classList.contains("is-open"));
      if (!openNode) return;
      setNodeOpen(openNode, false);
      openNode.focus({ preventScroll: true });
    };
    flow.addEventListener("keydown", onKeyDown);
    return () => {
      handlers.forEach((off) => off());
      flow.removeEventListener("keydown", onKeyDown);
      delete flow.dataset.wfInitialized;
    };
  }, [ref]);
}

type MiniFlowProps = { variant: MiniFlowVariant; label: string; nodes: readonly MiniNode[] };

export function MiniFlow({ variant, label, nodes }: MiniFlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useMiniFlow(ref);
  return (
    <div ref={ref} className={`wf-mini-flow wf-mini-flow--${variant}`} data-wf-mini-flow="" aria-label={label}>
      {nodes.map((node, i) => (
        <Fragment key={`${node.kind}-${node.title}`}>
          {i > 0 && <b className="wf-mini-flow__edge" aria-hidden="true" />}
          <MiniNodeButton node={node} />
        </Fragment>
      ))}
    </div>
  );
}

/** Shared `.proto-section-eyebrow` block (m02–m06 headings). */
export function SectionEyebrow({ name, context, underline = true }: { name: string; context: string; underline?: boolean }) {
  return (
    <div className={underline ? "proto-section-eyebrow proto-section-eyebrow--underline" : "proto-section-eyebrow"}>
      <span className="proto-section-eyebrow__rail" aria-hidden="true" />
      <span className="proto-section-eyebrow__copy">
        <span className="proto-section-eyebrow__name">{name}</span>
        <span className="proto-section-eyebrow__context">{context}</span>
      </span>
    </div>
  );
}
