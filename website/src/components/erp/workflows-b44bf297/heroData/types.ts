/*
 * Typed model of the /workflows hero editor demo (`.wf-hero` → `[data-wf-demo]`).
 * Extracted mechanically from the live DOM (docs/research/.../raw/rendered-desktop.html);
 * everything the source repeats verbatim (icons per kind, panel copy, handles, ids) is derived
 * by the render components instead of being stored per node.
 */

/** `erp-node--<kind>` / `erp-node__icon--<kind>` modifier. */
export type WfNodeKind = "trigger" | "condition" | "action" | "approval" | "agent" | "memory" | "gnn";

/** Fragment ids in workflow-ui-icons.svg (`#workflow-icon-<name>`). */
export type WfIconName =
  | "agent"
  | "arrow-right"
  | "arrows-maximize"
  | "bolt"
  | "checklist"
  | "chevron-left"
  | "device-floppy"
  | "dots"
  | "git-branch"
  | "gnn"
  | "history"
  | "lock"
  | "memory"
  | "minus"
  | "note"
  | "player-play"
  | "plus"
  | "settings"
  | "shield-check"
  | "x";

export const WF_KIND_ICON: Readonly<Record<WfNodeKind, WfIconName>> = {
  trigger: "bolt",
  condition: "git-branch",
  action: "arrow-right",
  approval: "shield-check",
  agent: "agent",
  memory: "memory",
  gnn: "gnn",
};

export interface WfNode {
  /** `data-wf-stage`: nodes of one stage run in parallel. */
  stage: number;
  kind: WfNodeKind;
  /** Node type label (`<small>`, footer, panel "Node type"). */
  label: string;
  /** Absolute position on the graph canvas (px). */
  left: number;
  top: number;
  title: string;
  /** Card context line, panel description and "Configuration" textarea. */
  context: string;
  /** Panel "Input" data row. */
  input: string;
  /** `data-wf-node-output`, activity line and panel "Output" data row. */
  output: string;
}

export interface WfEdge {
  source: number;
  target: number;
  /** SVG path `d`. */
  d: string;
}

/** The hidden draft node (and its edge) revealed by the "Add node" picker. */
export interface WfAddedNode {
  stage: number;
  left: number;
  top: number;
  /** Node the hidden edge starts from. */
  source: number;
  d: string;
}

export interface WfScene {
  /** `data-wf-scene` / tab target. */
  id: string;
  tab: string;
  /** `data-app-name`, shown in the breadcrumb. */
  appName: string;
  /** Workflow name: section aria-label, header name, node list label. */
  title: string;
  version: string;
  /** Graph canvas width (px); the SVG viewBox is `0 0 <width> 640`. */
  width: number;
  /** Workspace "Runs" panel summary, e.g. "10 nodes · 5 stages". */
  runSummary: string;
  nodes: readonly WfNode[];
  edges: readonly WfEdge[];
  added: WfAddedNode;
}

export interface WfNodeChoice {
  type: string;
  kind: WfNodeKind;
  title: string;
  detail: string;
  hint: string;
}

export interface WfConnector {
  /** Fragment id in plugin-logos.svg (`#plugin-<id>`). */
  id: string;
  label: string;
}
