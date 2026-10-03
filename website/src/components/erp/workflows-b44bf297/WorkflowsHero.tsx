import Link from "next/link";
import { toCloneHref } from "@/components/erp/shared/links";
import { WF_CONNECTORS, WF_DEFAULT_SCENE, WF_SCENES } from "./heroData";
import { PluginLogo } from "./WfIcon";
import { WorkflowDemo } from "./WorkflowDemo";
import { WorkflowScene } from "./WorkflowScene";

/*
 * /workflows hero (`header.wf-hero`): copy + CTAs, the interactive workflow editor demo
 * (5 scenes as tabs, run animation, node panels — behavior in workflowDemoController) and the
 * connector marquee (CSS animation; second list is the aria-hidden loop copy).
 */

const HERO_ACTIONS = [
  { href: "#workflow-run", label: " See a workflow run ", variant: "btn btn--primary" },
  { href: "https://erpai.studio/proto", label: " Open Proto ", variant: "btn btn--ghost" },
  { href: "/workflows/discovery", label: " Explore Discovery ", variant: "btn btn--ghost" },
] as const;

function ArrowRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right ui-icon"
      data-icon="arrow-right"
      aria-hidden="true"
      focusable="false"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M5 12l14 0" />
      <path d="M13 18l6 -6" />
      <path d="M13 6l6 6" />
    </svg>
  );
}

function SceneSwitcher({ activeScene }: { activeScene: string }) {
  return (
    <div className="wf-demo-switcher">
      <div className="wf-demo-switcher__tabs" role="tablist" aria-label="Choose a business workflow">
        {WF_SCENES.map((scene) => {
          const selected = scene.id === activeScene;
          return (
            <button
              key={scene.id}
              type="button"
              role="tab"
              id={`wf-tab-${scene.id}`}
              className="wf-demo-switcher__tab"
              data-wf-scene-target={scene.id}
              aria-selected={selected ? "true" : "false"}
              aria-controls={`wf-scene-${scene.id}`}
              tabIndex={selected ? 0 : -1}
            >
              {scene.tab}
            </button>
          );
        })}
      </div>
      <button type="button" className="wf-demo-switcher__play" data-wf-play="">
        Pause run
      </button>
    </div>
  );
}

function WorkflowFrame({ activeScene }: { activeScene: string }) {
  const appName = WF_SCENES.find((scene) => scene.id === activeScene)?.appName ?? "";
  return (
    <div className="erp-workflow-frame">
      <div className="erp-workflow-breadcrumb">
        <span>Apps</span>
        <span aria-hidden="true">›</span>
        <strong data-wf-app-name="">{appName}</strong>
        <span aria-hidden="true">›</span>
        <span>Protos</span>
      </div>
      <div className="erp-workflow-viewport">
        {WF_SCENES.map((scene) => (
          <WorkflowScene key={scene.id} scene={scene} active={scene.id === activeScene} />
        ))}
      </div>
    </div>
  );
}

function ConnectorList({ copy }: { copy: boolean }) {
  return (
    <ul aria-hidden={copy ? "true" : undefined}>
      {WF_CONNECTORS.map((connector) => (
        <li key={connector.id}>
          {copy ? (
            <span>
              <PluginLogo id={connector.id} />
            </span>
          ) : (
            <span role="img" aria-label={connector.label}>
              <PluginLogo id={connector.id} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ConnectorMarquee() {
  return (
    <div className="wf-connector-marquee" aria-label="Plugins available to workflows">
      <p className="wf-connector-marquee__label">Connectors:</p>
      <div className="wf-connector-marquee__window" role="group" aria-label="Plugin logos" tabIndex={0}>
        <div className="wf-connector-marquee__track">
          <ConnectorList copy={false} />
          <ConnectorList copy />
        </div>
      </div>
    </div>
  );
}

export function WorkflowsHero() {
  const activeScene = WF_DEFAULT_SCENE;
  return (
    <header className="wf-hero" aria-labelledby="workflow-hero-title">
      <div className="wf-shell wf-hero__grid">
        <div className="wf-hero__copy">
          <div className="proto-section-eyebrow proto-section-eyebrow--underline">
            <span className="proto-section-eyebrow__rail" aria-hidden="true" />
            <span className="proto-section-eyebrow__copy">
              <span className="proto-section-eyebrow__name">ERP.AI Workflows</span>
              <span className="proto-section-eyebrow__context">Apps, approvals, and Plugin actions</span>
            </span>
          </div>
          <h1 id="workflow-hero-title">Run the process, not just the task.</h1>
        </div>
        <div className="wf-hero__summary">
          <p>
            {" "}
            Build business processes and AI agents from ERP.AI records, Memory, GNN, approvals, and Plugin actions.
            Proto keeps the workflow versioned, inspectable, and runnable from the desktop.{" "}
          </p>
          <div className="wf-actions">
            {HERO_ACTIONS.map((action) => (
              <Link key={action.href} className={action.variant} href={toCloneHref(action.href)}>
                {action.label}
                <ArrowRightIcon />
              </Link>
            ))}
          </div>
        </div>
        <WorkflowDemo activeScene={activeScene}>
          <SceneSwitcher activeScene={activeScene} />
          <WorkflowFrame activeScene={activeScene} />
        </WorkflowDemo>
        <ConnectorMarquee />
      </div>
    </header>
  );
}
