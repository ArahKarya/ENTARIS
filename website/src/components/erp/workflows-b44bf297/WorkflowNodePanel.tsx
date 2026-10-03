import type { WfNode, WfNodeKind } from "./heroData";
import { WF_KIND_ICON } from "./heroData";
import { DRAFT_NODE } from "./WorkflowNodeCard";
import { WfIcon } from "./WfIcon";

/*
 * `[data-wf-node-panel]` dialogs (one per node, all hidden until a node is opened). The draft
 * variant carries the extra data-wf-* hooks the "Add node" picker rewrites.
 */

const PANEL_TABS = [
  ["configure", "Configure"],
  ["input", "Input"],
  ["output", "Output"],
  ["settings", "Settings"],
  ["history", "History"],
] as const;

interface PanelContent {
  kind: WfNodeKind;
  title: string;
  label: string;
  context: string;
  input: string;
  output: string;
  status: string;
  /** Closing sentence of the Input view (absent on the draft node). */
  inputNote?: string;
  outputNote?: string;
  settings: readonly (readonly [string, string])[];
  history: readonly [string, string];
}

const FINAL_OUTPUT_NOTE = "This is the workflow’s final output.";
const NEXT_OUTPUT_NOTE = "This payload continues to the next connected node.";

function nodeContent(node: WfNode, isFinal: boolean): PanelContent {
  return {
    kind: node.kind,
    title: node.title,
    label: node.label,
    context: node.context,
    input: node.input,
    output: node.output,
    status: "Configured",
    inputNote: `The previous node passes this value into ${node.title}.`,
    outputNote: isFinal ? FINAL_OUTPUT_NOTE : NEXT_OUTPUT_NOTE,
    settings: [
      ["Retry on failure", "Off"],
      ["Continue on error", "Off"],
    ],
    history: ["Current preview run", "Node input and output remain attached to this workflow version."],
  };
}

const DRAFT_CONTENT: PanelContent = {
  kind: "action",
  title: DRAFT_NODE.title,
  label: DRAFT_NODE.label,
  context: DRAFT_NODE.detail,
  input: "previous node output",
  output: DRAFT_NODE.output,
  status: "Draft",
  settings: [["Retry on failure", "Off"]],
  history: ["Not run yet", "This node belongs to the current draft."],
};

/** `data-*` hook attribute, present only on the draft panel. */
const hook = (draft: boolean, name: string): Record<string, string> => (draft ? { [name]: "" } : {});

function DataView({ view, count, value, note, draft }: { view: "input" | "output"; count: string; value: string; note?: string; draft: boolean }) {
  const isOutput = view === "output";
  return (
    <section className="erp-node-panel__view" data-wf-panel-view={view} hidden>
      <div className="erp-node-panel__section-head">
        <strong>{isOutput ? "Output" : "Input"}</strong>
        <span>{count}</span>
      </div>
      <div className={isOutput ? "erp-node-panel__data-row erp-node-panel__data-row--output" : "erp-node-panel__data-row"}>
        <span>data</span>
        <code {...hook(draft && isOutput, "data-wf-panel-output")}>{value}</code>
      </div>
      {note !== undefined && <p>{note}</p>}
    </section>
  );
}

function PanelBody({ c, fieldId, draft }: { c: PanelContent; fieldId: string; draft: boolean }) {
  return (
    <div className="erp-node-panel__body">
      <section className="erp-node-panel__view is-active" data-wf-panel-view="configure">
        <div className="erp-node-panel__section-head">
          <strong>Parameters</strong>
          <span>{c.status}</span>
        </div>
        <dl className="erp-node-panel__fields">
          <div>
            <dt>Node type</dt>
            <dd {...hook(draft, "data-wf-edit-type-label")}>{c.label}</dd>
          </div>
          <div>
            <dt>
              <label htmlFor={`wf-node-title-${fieldId}`}>Operation</label>
            </dt>
            <dd>
              <input id={`wf-node-title-${fieldId}`} data-wf-edit-title="" defaultValue={c.title} />
            </dd>
          </div>
          <div>
            <dt>
              <label htmlFor={`wf-node-detail-${fieldId}`}>Configuration</label>
            </dt>
            <dd>
              <textarea id={`wf-node-detail-${fieldId}`} data-wf-edit-detail="" rows={3} defaultValue={c.context} />
            </dd>
          </div>
        </dl>
        <button type="button" className="erp-node-panel__save" data-wf-save-node="">
          Save node changes
        </button>
      </section>
      <DataView view="input" count="1 item" value={c.input} note={c.inputNote} draft={draft} />
      <DataView view="output" count="1 item" value={c.output} note={c.outputNote} draft={draft} />
      <section className="erp-node-panel__view" data-wf-panel-view="settings" hidden>
        <div className="erp-node-panel__section-head">
          <strong>Settings</strong>
        </div>
        <dl className="erp-node-panel__fields">
          {c.settings.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="erp-node-panel__view" data-wf-panel-view="history" hidden>
        <div className="erp-node-panel__section-head">
          <strong>History</strong>
        </div>
        <div className="erp-node-panel__history">
          <span aria-hidden="true" />
          <p>
            <strong>{c.history[0]}</strong>
            {c.history[1]}
          </p>
        </div>
      </section>
    </div>
  );
}

function NodePanel({ sceneId, index, c, draft }: { sceneId: string; index: number; c: PanelContent; draft: boolean }) {
  return (
    <aside
      id={`wf-node-panel-${sceneId}-${index}`}
      className="erp-node-panel"
      data-wf-node-panel={index}
      role="dialog"
      aria-label={draft ? "Configure new node" : `Configure ${c.title}`}
      hidden
    >
      <header className="erp-node-panel__header">
        <span className={`erp-node-panel__icon erp-node__icon--${c.kind}`} {...hook(draft, "data-wf-added-panel-icon")}>
          <WfIcon name={WF_KIND_ICON[c.kind]} />
        </span>
        <span className="erp-node-panel__title">
          <strong {...hook(draft, "data-wf-panel-title")}>{c.title}</strong>
          {draft ? (
            <small>
              <span data-wf-panel-label="">{c.label}</span> node
            </small>
          ) : (
            <small>{`${c.label} node`}</small>
          )}
        </span>
        <span className="erp-node-panel__actions">
          <button type="button" data-wf-run-from-panel={index} aria-label="Run this node">
            <WfIcon name="player-play" />
          </button>
          <button type="button" data-wf-panel-expand="" aria-label="Expand node panel">
            <WfIcon name="arrows-maximize" />
          </button>
          <i aria-hidden="true" />
          <button type="button" data-wf-panel-close="" aria-label="Close node panel">
            <WfIcon name="x" />
          </button>
        </span>
      </header>
      <p className="erp-node-panel__description" {...hook(draft, "data-wf-panel-description")}>
        {c.context}
      </p>
      <div className="erp-node-panel__tabs" role="group" aria-label="Node details">
        {PANEL_TABS.map(([view, label]) => (
          <button key={view} type="button" data-wf-panel-tab={view} aria-pressed={view === "configure" ? "true" : "false"}>
            {label}
          </button>
        ))}
      </div>
      <PanelBody c={c} fieldId={`${sceneId}-${index}`} draft={draft} />
    </aside>
  );
}

export function WorkflowNodePanel({ sceneId, index, node, isFinal }: { sceneId: string; index: number; node: WfNode; isFinal: boolean }) {
  return <NodePanel sceneId={sceneId} index={index} c={nodeContent(node, isFinal)} draft={false} />;
}

export function WorkflowDraftNodePanel({ sceneId, index }: { sceneId: string; index: number }) {
  return <NodePanel sceneId={sceneId} index={index} c={DRAFT_CONTENT} draft />;
}
