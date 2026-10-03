import type { CSSProperties } from "react";
import type { WfScene } from "./heroData";
import { WorkflowDraftNodeCard, WorkflowNodeCard } from "./WorkflowNodeCard";
import { WorkflowDraftNodePanel, WorkflowNodePanel } from "./WorkflowNodePanel";
import { WorkflowCanvasControls, WorkflowHeader, WorkflowNodePicker, WorkflowWorkspacePanel } from "./WorkflowSceneChrome";

type CSSVars = CSSProperties & Record<`--${string}`, string>;

/** Graph height shared by every scene (`viewBox="0 0 <width> 640"`). */
const GRAPH_HEIGHT = 640;

/** React's SVG typings omit `hidden`, but the source keeps the draft edge `<g hidden>`. */
const HIDDEN_SVG = { hidden: true };

function WorkflowGraph({ scene }: { scene: WfScene }) {
  const draftIndex = scene.nodes.length;
  const graphStyle: CSSVars = { width: `${scene.width}px`, "--wf-zoom": "1" };
  return (
    <div className="erp-workflow-graph" data-wf-graph="" style={graphStyle}>
      <svg className="erp-workflow-edges" viewBox={`0 0 ${scene.width} ${GRAPH_HEIGHT}`} aria-hidden="true">
        {scene.edges.map((edge, i) => (
          <g key={i} data-wf-edge={i} data-wf-source={edge.source} data-wf-target={edge.target}>
            <path d={edge.d} />
          </g>
        ))}
        <g
          data-wf-edge={scene.edges.length}
          data-wf-source={scene.added.source}
          data-wf-target={draftIndex}
          data-wf-added-edge=""
          {...HIDDEN_SVG}
        >
          <path d={scene.added.d} />
        </g>
      </svg>
      <div className="erp-node-list" aria-label={`${scene.title} steps`}>
        {scene.nodes.map((node, i) => (
          <WorkflowNodeCard
            key={i}
            sceneId={scene.id}
            index={i}
            node={node}
            hasSource={scene.edges.some((e) => e.source === i) || scene.added.source === i}
          />
        ))}
        <WorkflowDraftNodeCard sceneId={scene.id} index={draftIndex} added={scene.added} />
      </div>
    </div>
  );
}

export function WorkflowScene({ scene, active }: { scene: WfScene; active: boolean }) {
  const lastIndex = scene.nodes.length - 1;
  return (
    <section
      id={`wf-scene-${scene.id}`}
      className={active ? "wf-scene is-active" : "wf-scene"}
      role="tabpanel"
      data-wf-scene={scene.id}
      data-app-name={scene.appName}
      aria-labelledby={`wf-tab-${scene.id}`}
      aria-label={scene.title}
      style={{ width: `max(100%,${scene.width}px)`, minWidth: `${scene.width}px` }}
      data-wf-zoom="1"
      hidden={!active}
    >
      <div className="erp-workflow-canvas">
        <WorkflowHeader title={scene.title} version={scene.version} />
        <WorkflowGraph scene={scene} />
        {scene.nodes.map((node, i) => (
          <WorkflowNodePanel key={i} sceneId={scene.id} index={i} node={node} isFinal={i === lastIndex} />
        ))}
        <WorkflowDraftNodePanel sceneId={scene.id} index={scene.nodes.length} />
        <WorkflowNodePicker />
        <WorkflowCanvasControls />
        <WorkflowWorkspacePanel runSummary={scene.runSummary} />
      </div>
    </section>
  );
}
