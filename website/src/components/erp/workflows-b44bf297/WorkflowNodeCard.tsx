import { WF_KIND_ICON, type WfAddedNode, type WfNode } from "./heroData";
import { WfIcon } from "./WfIcon";

/*
 * Node cards on the editor graph. Rendered in their pristine server state (no run classes,
 * hidden empty exec badge, "0 / 1" / "Waiting"); workflowDemoController's renderStep() drives
 * the run state afterwards exactly like workflow-motion.js.
 */

interface NodeCardProps {
  sceneId: string;
  index: number;
  node: WfNode;
  hasSource: boolean;
}

function NodeActivity({ output, draft }: { output: string; draft: boolean }) {
  return (
    <div className="erp-node__activity" data-wf-node-activity="">
      {draft ? <strong data-wf-node-output="">{output}</strong> : <strong>{output}</strong>}
      <span aria-hidden="true">
        <i data-wf-node-progress-bar="" />
      </span>
      <small>
        <b data-wf-node-progress="">0 / 1</b>
        <em data-wf-node-runtime="">Waiting</em>
      </small>
    </div>
  );
}

function NodeMenu() {
  return (
    <span className="erp-node__menu" aria-hidden="true">
      <WfIcon name="dots" />
    </span>
  );
}

function Configured() {
  return (
    <span className="erp-node__configured">
      <i aria-hidden="true" />
      Configured
    </span>
  );
}

export function WorkflowNodeCard({ sceneId, index, node, hasSource }: NodeCardProps) {
  return (
    <div
      className={`erp-node erp-node--${node.kind}`}
      data-wf-node={index}
      data-wf-stage={node.stage}
      data-wf-node-output={node.output}
      data-wf-node-open=""
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls={`wf-node-panel-${sceneId}-${index}`}
      style={{ left: `${node.left}px`, top: `${node.top}px` }}
    >
      {node.stage > 0 && <span className="erp-node__handle erp-node__handle--target" aria-hidden="true" />}
      <span className="erp-node__exec-badge" data-wf-node-status="" hidden />
      <div className="erp-node__main">
        <span className={`erp-node__icon erp-node__icon--${node.kind}`}>
          <WfIcon name={WF_KIND_ICON[node.kind]} />
        </span>
        <span className="erp-node__title">
          <strong>{node.title}</strong>
          <small>{node.label}</small>
        </span>
        <NodeMenu />
      </div>
      <div className="erp-node__context">{node.context}</div>
      <NodeActivity output={node.output} draft={false} />
      <div className="erp-node__footer">
        <span>{node.label}</span>
        <Configured />
      </div>
      {hasSource && <span className="erp-node__handle erp-node__handle--source" aria-hidden="true" />}
    </div>
  );
}

/** Hidden draft node that the "Add node" picker reveals and rewrites. */
export const DRAFT_NODE = {
  title: "New app action",
  label: "App action",
  detail: "Configure the record update",
  output: "new node output",
} as const;

export function WorkflowDraftNodeCard({ sceneId, index, added }: { sceneId: string; index: number; added: WfAddedNode }) {
  return (
    <div
      className="erp-node erp-node--action"
      data-wf-node={index}
      data-wf-stage={added.stage}
      data-wf-added-node=""
      data-wf-node-open=""
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls={`wf-node-panel-${sceneId}-${index}`}
      style={{ left: `${added.left}px`, top: `${added.top}px` }}
      hidden
    >
      <span className="erp-node__handle erp-node__handle--target" aria-hidden="true" />
      <span className="erp-node__exec-badge" data-wf-node-status="" hidden />
      <div className="erp-node__main">
        <span className="erp-node__icon erp-node__icon--action" data-wf-added-icon="">
          <WfIcon name="arrow-right" />
        </span>
        <span className="erp-node__title">
          <strong data-wf-node-title="">{DRAFT_NODE.title}</strong>
          <small data-wf-node-label="">{DRAFT_NODE.label}</small>
        </span>
        <NodeMenu />
      </div>
      <div className="erp-node__context" data-wf-node-detail="">
        {DRAFT_NODE.detail}
      </div>
      <NodeActivity output={DRAFT_NODE.output} draft />
      <div className="erp-node__footer">
        <span data-wf-node-footer-label="">{DRAFT_NODE.label}</span>
        <Configured />
      </div>
    </div>
  );
}
