import { financeScene } from "./finance";
import { incidentScene } from "./incident";
import { peopleScene } from "./people";
import { procurementAgentScene } from "./procurementAgent";
import { supportScene } from "./support";
import type { WfNodeChoice, WfScene } from "./types";

export { WF_CONNECTORS } from "./connectors";
export { WF_KIND_ICON } from "./types";
export type { WfAddedNode, WfConnector, WfEdge, WfIconName, WfNode, WfNodeChoice, WfNodeKind, WfScene } from "./types";

/** Scenes in tab order (Finance ops, Agentic Workflows, Customer support, People ops, IT operations). */
export const WF_SCENES: readonly WfScene[] = [financeScene, procurementAgentScene, supportScene, peopleScene, incidentScene];

/** Scene shown before the run loop starts (`demo.dataset.activeScene || scenes[0]`). */
export const WF_DEFAULT_SCENE = WF_SCENES[0].id;

/** "Add node" picker choices (identical in every scene). */
export const WF_NODE_CHOICES: readonly WfNodeChoice[] = [
  {
    type: "App action",
    kind: "action",
    title: "Update the business record",
    detail: "Write the reviewed result back to the ERP.AI app",
    hint: "Update a record in ERP.AI",
  },
  {
    type: "Plugin action",
    kind: "action",
    title: "Send through a Plugin",
    detail: "Choose an approved action in a connected Plugin",
    hint: "Run an approved external action",
  },
  {
    type: "Approval",
    kind: "approval",
    title: "Request approval",
    detail: "Pause this branch until the assigned reviewer decides",
    hint: "Keep a human decision in the run",
  },
  {
    type: "Condition",
    kind: "condition",
    title: "Check a condition",
    detail: "Route this branch using fields from the current record",
    hint: "Route by record data",
  },
  {
    type: "AI Agent",
    kind: "agent",
    title: "Evaluate with an AI agent",
    detail: "Reason over the current record, cited memory, and connected business context",
    hint: "Prepare a decision with reasons",
  },
  {
    type: "Memory",
    kind: "memory",
    title: "Retrieve process memory",
    detail: "Load cited policies and prior approved decisions",
    hint: "Retrieve cited process context",
  },
  {
    type: "GNN",
    kind: "gnn",
    title: "Map business relationships",
    detail: "Resolve connected vendors, requests, cost centers, and owners",
    hint: "Map connected business records",
  },
];
