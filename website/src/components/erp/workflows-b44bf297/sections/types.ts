/** Node kinds (`wf-mini-node--<kind>`) used by the workflows page mini flows. */
export type MiniNodeKind = "trigger" | "condition" | "approval" | "memory" | "gnn" | "agent" | "action";

/** One expandable `[data-wf-mini-node]` button. */
export type MiniNode = {
  kind: MiniNodeKind;
  /** Symbol in workflow-ui-icons.svg, without the `workflow-icon-` prefix. */
  icon: string;
  title: string;
  label: string;
  context: string;
  footer: string;
  status: string;
  /** `[data-wf-mini-node-details]` rows: [label, value]. */
  details: readonly (readonly [string, string])[];
};

/** `wf-mini-flow--<variant>` */
export type MiniFlowVariant = "record" | "card" | "control";

export type PluginChip = { logo: string; name: string };

/** A business process: story chapter + record scene (#workflow-run) and app card (#apps-plugins). */
export type WorkflowProcess = {
  id: string;
  num: string;
  area: string;
  headline: string;
  summary: string;
  system: string;
  title: string;
  status: string;
  columns: readonly string[];
  cells: readonly string[];
  gate: string;
  plugins: readonly PluginChip[];
  nodes: readonly MiniNode[];
};

export type PluginEntry = {
  category: string;
  logo: string;
  logoLabel: string;
  name: string;
  group: string;
};

export type ControlCard = {
  eyebrow: string;
  title: string;
  body: string;
  flowLabel: string;
  nodes: readonly MiniNode[];
};
