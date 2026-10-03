import { WF_KIND_ICON, WF_NODE_CHOICES } from "./heroData";
import { WfIcon } from "./WfIcon";

/*
 * Editor chrome repeated in every scene: header bar, add-node rail + picker, zoom controls,
 * bottom panel menu and the workspace (Runs / Audit / Settings) dialog. Their inline
 * left/width/transform are written at runtime by positionSceneChrome() in the controller.
 */

export function WorkflowHeader({ title, version }: { title: string; version: string }) {
  return (
    <header className="erp-workflow-header">
      <div className="erp-workflow-header__left">
        <button type="button" className="erp-icon-button erp-icon-button--round" aria-label="Back to protos">
          <WfIcon name="chevron-left" />
        </button>
        <div className="erp-workflow-header__name">
          <strong>{title}</strong>
          <span>{version}</span>
        </div>
      </div>
      <span className="erp-workflow-header__saved" data-wf-save-state="">
        All changes saved
      </span>
      <div className="erp-workflow-header__actions">
        <button type="button" className="erp-header-action">
          <WfIcon name="lock" />
          <span>Lock</span>
        </button>
        <button type="button" className="erp-header-action erp-header-action--active">
          <span className="erp-status-dot" aria-hidden="true" />
          <span>Active</span>
        </button>
        <button type="button" className="erp-header-action erp-header-action--save">
          <WfIcon name="device-floppy" />
          <span>Save</span>
        </button>
      </div>
    </header>
  );
}

export function WorkflowNodePicker() {
  return (
    <>
      <button type="button" className="erp-add-node-rail" data-wf-add-node="" aria-label="Add node" aria-expanded="false">
        <WfIcon name="plus" />
      </button>
      <aside className="erp-node-picker" data-wf-node-picker="" aria-label="Add a node" hidden>
        <header>
          <strong>Add node</strong>
          <button type="button" data-wf-node-picker-close="" aria-label="Close node picker">
            <WfIcon name="x" />
          </button>
        </header>
        <p>Add another branch to the current record.</p>
        <div>
          {WF_NODE_CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              data-wf-add-node-type={choice.type}
              data-wf-add-node-kind={choice.kind}
              data-wf-add-node-title={choice.title}
              data-wf-add-node-detail={choice.detail}
            >
              <span className={`erp-node__icon erp-node__icon--${choice.kind}`}>
                <WfIcon name={WF_KIND_ICON[choice.kind]} />
              </span>
              <span>
                <strong>{choice.type}</strong>
                <small>{choice.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export function WorkflowCanvasControls() {
  return (
    <>
      <div className="erp-canvas-controls" aria-label="Canvas controls">
        <button type="button" data-wf-zoom-out="" aria-label="Zoom out">
          <WfIcon name="minus" />
        </button>
        <button type="button" data-wf-zoom-in="" aria-label="Zoom in">
          <WfIcon name="plus" />
        </button>
      </div>
      <nav className="erp-bottom-menu" aria-label="Workflow panels">
        <button type="button" data-wf-workspace-panel="runs" aria-label="Open workflow runs" aria-expanded="false">
          <WfIcon name="history" />
          <span>Runs</span>
        </button>
        <button type="button" data-wf-workspace-panel="audit" aria-label="Open workflow audit" aria-expanded="false">
          <WfIcon name="checklist" />
          <span>Audit</span>
        </button>
        <button type="button" data-wf-workspace-panel="settings" aria-label="Open workflow settings" aria-expanded="false">
          <WfIcon name="settings" />
          <span>Settings</span>
        </button>
        <button type="button" data-wf-add-note="" aria-label="Add a workflow note">
          <WfIcon name="note" />
          <span>Note</span>
        </button>
      </nav>
    </>
  );
}

const AUDIT_ITEMS = [
  ["Workflow opened", "Current desktop session"],
  ["Version 6 saved", "Node configuration retained"],
  ["Approval remains required", "No gated action has been released"],
] as const;

const RUN_ITEMS = [
  ["Current preview", "Ready to run"],
  ["Previous version", "Completed with review"],
] as const;

const SETTINGS_ITEMS = [
  ["Require approval", "Pause before gated actions", true],
  ["Keep run history", "Retain inputs and outputs with this version", true],
  ["Continue on branch failure", "Let unaffected branches finish", false],
] as const;

function Timeline({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <ol className="erp-workspace-panel__timeline">
      {items.map(([title, detail]) => (
        <li key={title}>
          <i aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorkflowWorkspacePanel({ runSummary }: { runSummary: string }) {
  return (
    <aside className="erp-workspace-panel" data-wf-workspace-panel-dialog="" role="dialog" aria-label="Workflow details" hidden>
      <header>
        <span>
          <small>Workflow</small>
          <strong data-wf-workspace-panel-title="">Runs</strong>
        </span>
        <button type="button" data-wf-workspace-panel-close="" aria-label="Close workflow panel">
          <WfIcon name="x" />
        </button>
      </header>
      <div className="erp-workspace-panel__view" data-wf-workspace-panel-view="runs">
        <div className="erp-workspace-panel__run-summary">
          <span>Latest run</span>
          <strong>{runSummary}</strong>
          <small>All branch outputs retained</small>
        </div>
        <Timeline items={RUN_ITEMS} />
        <button type="button" className="erp-workspace-panel__primary" data-wf-replay-run="">
          Run this workflow
        </button>
      </div>
      <div className="erp-workspace-panel__view" data-wf-workspace-panel-view="audit" hidden>
        <Timeline items={AUDIT_ITEMS} />
      </div>
      <div className="erp-workspace-panel__view" data-wf-workspace-panel-view="settings" hidden>
        {SETTINGS_ITEMS.map(([title, detail, checked]) => (
          <label key={title} className="erp-workspace-panel__setting">
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <input type="checkbox" defaultChecked={checked} />
          </label>
        ))}
      </div>
    </aside>
  );
}
