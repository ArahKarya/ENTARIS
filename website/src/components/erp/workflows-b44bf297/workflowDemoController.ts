import { createCanvasNote, positionSceneChrome, q, sceneZoom, setCanvasZoom } from "./workflowDemoChrome";

/*
 * Port of workflow-motion.js initDemo() for the /workflows hero editor (`[data-wf-demo]`).
 * Same hooks, classes, copy and timings as the source:
 * - scene tabs (click + ArrowLeft/ArrowRight/Home/End), rail auto-scroll to the selected tab
 * - run loop: one stage every 2600 ms, then the next scene; "Pause run" / "Run workflow" toggle
 * - node status badges, progress, runtimes, edge is-complete/is-active, header save state
 * - node panels (open/close/expand, Configure/Input/Output/Settings/History views, run from node,
 *   save node edits), add-node picker, workspace Runs/Audit/Settings dialog, canvas notes, zoom
 * - Escape closes dialogs; reduced motion shows the completed run and stops playback
 * Returns a teardown that removes every listener, timer and frame (React unmount / StrictMode).
 */

const RUNTIMES = ["118ms", "264ms", "391ms", "172ms", "308ms", "224ms", "416ms", "283ms", "347ms", "196ms", "251ms"];
const TICK_MS = 2600;
const SAVE_FEEDBACK_MS = 900;
const NODE_KIND_CLASSES = [
  "erp-node--action",
  "erp-node--approval",
  "erp-node--condition",
  "erp-node--agent",
  "erp-node--memory",
  "erp-node--gnn",
];

const all = <T extends Element = HTMLElement>(root: ParentNode | null | undefined, selector: string): T[] =>
  root ? Array.from(root.querySelectorAll<T>(selector)) : [];

const setText = (el: Element | null, value: string) => {
  if (el) el.textContent = value;
};

export function initWorkflowDemo(demo: HTMLElement): () => void {
  if (demo.dataset.wfInitialized === "true") return () => undefined;
  demo.dataset.wfInitialized = "true";

  const abort = new AbortController();
  const { signal } = abort;
  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement | null | undefined,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    passive = false,
  ) => target?.addEventListener(type, handler, { signal, passive });
  const timeouts = new Set<number>();
  const frames = new Set<number>();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tabs = all(demo, "[data-wf-scene-target]");
  const scenes = all(demo, "[data-wf-scene]");
  const playButton = q(demo, "[data-wf-play]");
  const appName = q(demo, "[data-wf-app-name]");
  const viewport = q(demo, ".erp-workflow-viewport");
  let activeSceneId = demo.dataset.activeScene || scenes[0]?.dataset.wfScene || "";
  let step = -1;
  let playing = !reducedMotion.matches;
  let noteCount = 0;

  const activeScene = () => scenes.find((scene) => scene.dataset.wfScene === activeSceneId) || scenes[0];
  const chrome = (scene: HTMLElement | null | undefined) => positionSceneChrome(scene, viewport);
  const sceneOf = (el: Element) => el.closest<HTMLElement>("[data-wf-scene]");
  const nodeIn = (scene: ParentNode | null | undefined, index: string | undefined) =>
    q(scene, `[data-wf-node="${index}"]`);

  function stageCount(scene: HTMLElement | undefined): number {
    const stages = all(scene, "[data-wf-node]:not([hidden])").map((node) => Number(node.dataset.wfStage || 0));
    return stages.length ? Math.max(...stages) + 1 : 0;
  }

  function updatePlayButton() {
    if (!playButton) return;
    playButton.textContent = playing ? "Pause run" : "Run workflow";
    demo.dataset.playing = String(playing);
  }

  function renderStep(nextStep: number) {
    const scene = activeScene();
    if (!scene) return;
    const nodes = all(scene, "[data-wf-node]:not([hidden])");
    const edges = all<SVGGElement>(scene, "[data-wf-edge]:not([hidden])");
    const saveState = q(scene, "[data-wf-save-state]");
    const totalStages = stageCount(scene);
    step = nextStep;
    demo.dataset.running = String(step >= 0 && step < totalStages);

    nodes.forEach((node, index) => {
      const nodeStage = Number(node.dataset.wfStage || 0);
      const complete = nodeStage < step;
      const running = nodeStage === step && step < totalStages;
      node.classList.toggle("is-complete", complete);
      node.classList.toggle("is-running", running);
      node.classList.toggle("is-waiting", nodeStage > step);
      const nodeRuntime = RUNTIMES[index % RUNTIMES.length];
      const badge = q(node, "[data-wf-node-status]");
      if (badge) {
        badge.hidden = !(nodeStage <= step && step >= 0);
        badge.textContent = complete ? nodeRuntime : "Running";
      }
      setText(q(node, "[data-wf-node-progress]"), complete ? "1 / 1" : "0 / 1");
      setText(q(node, "[data-wf-node-runtime]"), complete ? nodeRuntime : running ? "Running" : "Waiting");
    });

    edges.forEach((edge) => {
      const target = nodeIn(scene, edge.dataset.wfTarget);
      const targetStage = Number(target?.dataset.wfStage || 0);
      edge.classList.toggle("is-complete", targetStage < step);
      edge.classList.toggle("is-active", targetStage === step && step < totalStages);
    });

    if (saveState) {
      if (step < 0) saveState.textContent = "All changes saved";
      else if (step >= totalStages) saveState.textContent = "Run complete";
      else {
        const runningNodes = nodes.filter((node) => Number(node.dataset.wfStage || 0) === step).length;
        saveState.textContent = runningNodes > 1 ? `${runningNodes} branches running…` : "Running workflow…";
      }
    }
  }

  function setPanelView(panel: HTMLElement, viewName: string | undefined) {
    all(panel, "[data-wf-panel-tab]").forEach((tab) => {
      tab.setAttribute("aria-pressed", String(tab.dataset.wfPanelTab === viewName));
    });
    all(panel, "[data-wf-panel-view]").forEach((view) => {
      const selected = view.dataset.wfPanelView === viewName;
      view.hidden = !selected;
      view.classList.toggle("is-active", selected);
    });
  }

  function closeNodePanels(scene: HTMLElement | null | undefined, restoreFocus = false) {
    all(scene, "[data-wf-node-panel]").forEach((panel) => {
      const node = nodeIn(scene, panel.dataset.wfNodePanel);
      const wasOpen = !panel.hidden;
      panel.hidden = true;
      panel.classList.remove("is-expanded");
      node?.classList.remove("is-selected");
      node?.setAttribute("aria-expanded", "false");
      if (restoreFocus && wasOpen) node?.focus();
    });
  }

  function closeNodePicker(scene: HTMLElement | null | undefined) {
    const picker = q(scene, "[data-wf-node-picker]");
    if (picker) picker.hidden = true;
    q(scene, "[data-wf-add-node]")?.setAttribute("aria-expanded", "false");
  }

  function closeWorkspacePanel(scene: HTMLElement | null | undefined, restoreFocus = false) {
    const panel = q(scene, "[data-wf-workspace-panel-dialog]");
    const activeName = panel?.dataset.wfWorkspacePanelActive;
    const activeButton = activeName ? q(scene, `[data-wf-workspace-panel="${activeName}"]`) : null;
    if (panel) {
      panel.hidden = true;
      delete panel.dataset.wfWorkspacePanelActive;
    }
    all(scene, "[data-wf-workspace-panel]").forEach((button) => button.setAttribute("aria-expanded", "false"));
    if (restoreFocus) activeButton?.focus({ preventScroll: true });
  }

  function pause() {
    playing = false;
    updatePlayButton();
  }

  function openWorkspacePanel(scene: HTMLElement, panelName: string) {
    const panel = q(scene, "[data-wf-workspace-panel-dialog]");
    const button = q(scene, `[data-wf-workspace-panel="${panelName}"]`);
    if (!panel || !button) return;
    const shouldClose = !panel.hidden && panel.dataset.wfWorkspacePanelActive === panelName;
    closeWorkspacePanel(scene);
    if (shouldClose) return;
    closeNodePicker(scene);
    closeNodePanels(scene);
    pause();
    panel.dataset.wfWorkspacePanelActive = panelName;
    panel.hidden = false;
    setText(q(panel, "[data-wf-workspace-panel-title]"), panelName.charAt(0).toUpperCase() + panelName.slice(1));
    all(panel, "[data-wf-workspace-panel-view]").forEach((view) => {
      view.hidden = view.dataset.wfWorkspacePanelView !== panelName;
    });
    button.setAttribute("aria-expanded", "true");
    q(panel, "[data-wf-workspace-panel-close]")?.focus({ preventScroll: true });
  }

  function openNodePanel(scene: HTMLElement | null, nodeIndex: string | undefined) {
    if (!scene) return;
    closeNodePanels(scene);
    const node = nodeIn(scene, nodeIndex);
    const panel = q(scene, `[data-wf-node-panel="${nodeIndex}"]`);
    if (!node || !panel) return;
    closeNodePicker(scene);
    pause();
    setPanelView(panel, "configure");
    panel.hidden = false;
    node.classList.add("is-selected");
    node.setAttribute("aria-expanded", "true");
    chrome(scene);
    q(panel, "[data-wf-panel-close]")?.focus({ preventScroll: true });
  }

  function setScene(sceneId: string, restart = true) {
    const scene = scenes.find((item) => item.dataset.wfScene === sceneId);
    if (!scene) return;
    activeSceneId = sceneId;
    demo.dataset.activeScene = sceneId;
    scenes.forEach((item) => {
      const selected = item === scene;
      item.hidden = !selected;
      item.classList.toggle("is-active", selected);
    });
    tabs.forEach((tab) => {
      const selected = tab.dataset.wfSceneTarget === sceneId;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const rail = tab.parentElement;
      if (selected && rail && rail.scrollWidth > rail.clientWidth) {
        const left = Math.max(0, tab.offsetLeft - rail.clientWidth / 2 + tab.offsetWidth / 2);
        rail.scrollTo({ left, behavior: reducedMotion.matches ? "auto" : "smooth" });
      }
    });
    if (appName) appName.textContent = scene.dataset.appName || "";
    scenes.forEach((item) => {
      closeNodePanels(item);
      closeNodePicker(item);
      closeWorkspacePanel(item);
    });
    if (restart) renderStep(reducedMotion.matches ? stageCount(scene) : -1);
    const frame = window.requestAnimationFrame(() => {
      frames.delete(frame);
      chrome(scene);
    });
    frames.add(frame);
  }

  function advance() {
    if (!playing || !demo.isConnected) return;
    const totalStages = stageCount(activeScene());
    if (step < totalStages) {
      renderStep(step + 1);
      return;
    }
    const currentIndex = scenes.findIndex((item) => item.dataset.wfScene === activeSceneId);
    const nextId = scenes[(currentIndex + 1) % scenes.length]?.dataset.wfScene;
    if (nextId) setScene(nextId);
  }

  const resume = () => {
    if (!reducedMotion.matches) playing = true;
    updatePlayButton();
  };

  tabs.forEach((tab) => {
    on(tab, "click", () => {
      const sceneId = tab.dataset.wfSceneTarget;
      if (!sceneId) return;
      setScene(sceneId);
      resume();
    });
  });

  on(tabs[0]?.closest<HTMLElement>('[role="tablist"]'), "keydown", (event) => {
    const currentIndex = tabs.indexOf(event.target as HTMLElement);
    if (currentIndex === -1 || tabs.length < 2) return;
    const keyTargets: Record<string, number> = {
      ArrowRight: (currentIndex + 1) % tabs.length,
      ArrowLeft: (currentIndex - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!Object.hasOwn(keyTargets, event.key)) return;
    const nextIndex = keyTargets[event.key];
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  });

  all(demo, "[data-wf-run]").forEach((button) => {
    on(button, "click", () => {
      renderStep(0);
      resume();
    });
  });

  all(demo, "[data-wf-node-open]").forEach((node) => {
    on(node, "click", (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      openNodePanel(sceneOf(node), node.dataset.wfNode);
    });
    on(node, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openNodePanel(sceneOf(node), node.dataset.wfNode);
    });
  });

  all(demo, "[data-wf-node-panel]").forEach((panel) => bindNodePanel(panel));

  function bindNodePanel(panel: HTMLElement) {
    on(q(panel, "[data-wf-panel-close]"), "click", () => closeNodePanels(sceneOf(panel), true));

    const expandButton = q(panel, "[data-wf-panel-expand]");
    on(expandButton, "click", () => {
      const expanded = panel.classList.toggle("is-expanded");
      expandButton?.setAttribute("aria-label", expanded ? "Restore node panel" : "Expand node panel");
      chrome(sceneOf(panel));
    });

    all(panel, "[data-wf-panel-tab]").forEach((tab) => {
      on(tab, "click", () => setPanelView(panel, tab.dataset.wfPanelTab));
    });

    const runButton = q(panel, "[data-wf-run-from-panel]");
    on(runButton, "click", () => {
      const scene = sceneOf(panel);
      if (scene !== activeScene()) return;
      const node = nodeIn(scene, runButton?.dataset.wfRunFromPanel);
      renderStep(Number(node?.dataset.wfStage || 0));
      resume();
    });

    const saveButton = q(panel, "[data-wf-save-node]");
    on(saveButton, "click", () => saveNode(panel, saveButton));
  }

  function saveNode(panel: HTMLElement, saveButton: HTMLElement | null) {
    const scene = sceneOf(panel);
    const node = nodeIn(scene, panel.dataset.wfNodePanel);
    if (!scene || !node || !saveButton) return;
    const title = q<HTMLInputElement>(panel, "[data-wf-edit-title]")?.value.trim();
    const detail = q<HTMLTextAreaElement>(panel, "[data-wf-edit-detail]")?.value.trim();
    if (title) {
      setText(q(node, ".erp-node__title strong"), title);
      setText(q(panel, ".erp-node-panel__title strong"), title);
    }
    if (detail) {
      setText(q(node, "[data-wf-node-detail], .erp-node__context"), detail);
      setText(q(panel, ".erp-node-panel__description"), detail);
    }
    setText(q(scene, "[data-wf-save-state]"), "Node changes saved");
    saveButton.textContent = "Saved";
    saveButton.classList.add("is-saved");
    const timeout = window.setTimeout(() => {
      timeouts.delete(timeout);
      saveButton.textContent = "Save node changes";
      saveButton.classList.remove("is-saved");
    }, SAVE_FEEDBACK_MS);
    timeouts.add(timeout);
  }

  function addPickedNode(scene: HTMLElement, choice: HTMLElement) {
    const node = q(scene, "[data-wf-added-node]");
    const edge = q<SVGGElement>(scene, "[data-wf-added-edge]");
    const addedNodeIndex = node?.dataset.wfNode;
    const panel = q(scene, `[data-wf-node-panel="${addedNodeIndex}"]`);
    if (!node || !edge || !panel) return;
    const type = choice.dataset.wfAddNodeType || "App action";
    const kind = choice.dataset.wfAddNodeKind || "action";
    const title = choice.dataset.wfAddNodeTitle || `New ${type.toLowerCase()}`;
    const detail = choice.dataset.wfAddNodeDetail || "Configure this node";
    const output = `${type.toLowerCase()} result`;
    node.hidden = false;
    edge.removeAttribute("hidden");
    node.classList.remove(...NODE_KIND_CLASSES);
    node.classList.add(`erp-node--${kind}`);
    setText(q(node, "[data-wf-node-title]"), title);
    setText(q(node, "[data-wf-node-label]"), type);
    setText(q(node, "[data-wf-node-footer-label]"), type);
    setText(q(node, "[data-wf-node-detail]"), detail);
    setText(q(node, "[data-wf-node-output]"), output);
    const choiceIcon = q(choice, ".erp-node__icon");
    const nodeIcon = q(node, "[data-wf-added-icon]");
    const panelIcon = q(panel, "[data-wf-added-panel-icon]");
    if (choiceIcon && nodeIcon && panelIcon) {
      nodeIcon.className = choiceIcon.className;
      panelIcon.className = `erp-node-panel__icon erp-node__icon--${kind}`;
      // Copies the picker's own server-rendered sprite markup (no external content).
      nodeIcon.innerHTML = choiceIcon.innerHTML;
      panelIcon.innerHTML = choiceIcon.innerHTML;
    }
    setText(q(panel, "[data-wf-panel-title]"), title);
    setText(q(panel, "[data-wf-panel-label]"), type);
    setText(q(panel, "[data-wf-panel-description]"), detail);
    setText(q(panel, "[data-wf-edit-type-label]"), type);
    const titleInput = q<HTMLInputElement>(panel, "[data-wf-edit-title]");
    const detailInput = q<HTMLTextAreaElement>(panel, "[data-wf-edit-detail]");
    if (titleInput) titleInput.value = title;
    if (detailInput) detailInput.value = detail;
    setText(q(panel, "[data-wf-panel-output]"), output);
    closeNodePicker(scene);
    renderStep(step);
    openNodePanel(scene, addedNodeIndex);
  }

  scenes.forEach((scene) => bindScene(scene));

  function bindScene(scene: HTMLElement) {
    const addButton = q(scene, "[data-wf-add-node]");
    const picker = q(scene, "[data-wf-node-picker]");
    addButton?.setAttribute("aria-expanded", "false");
    on(addButton, "click", () => {
      if (!picker) return;
      const opening = picker.hidden;
      scenes.forEach((item) => closeNodePicker(item));
      closeNodePanels(scene);
      picker.hidden = !opening;
      addButton?.setAttribute("aria-expanded", String(opening));
      if (opening) {
        pause();
        chrome(scene);
        q(picker, "[data-wf-add-node-type]")?.focus({ preventScroll: true });
      }
    });

    on(q(picker, "[data-wf-node-picker-close]"), "click", () => {
      closeNodePicker(scene);
      addButton?.focus({ preventScroll: true });
    });

    all(picker, "[data-wf-add-node-type]").forEach((choice) => {
      on(choice, "click", () => addPickedNode(scene, choice));
    });

    all(scene, "[data-wf-workspace-panel]").forEach((button) => {
      on(button, "click", () => {
        const name = button.dataset.wfWorkspacePanel;
        if (name) openWorkspacePanel(scene, name);
        chrome(scene);
      });
    });

    on(q(scene, "[data-wf-add-note]"), "click", () => {
      const graph = q(scene, "[data-wf-graph]");
      if (!graph || !viewport) return;
      closeNodePanels(scene);
      closeNodePicker(scene);
      closeWorkspacePanel(scene);
      pause();
      noteCount += 1;
      createCanvasNote(scene, graph, viewport, noteCount, signal);
    });

    on(q(scene, "[data-wf-zoom-out]"), "click", () => setCanvasZoom(scene, sceneZoom(scene) - 0.1));
    on(q(scene, "[data-wf-zoom-in]"), "click", () => setCanvasZoom(scene, sceneZoom(scene) + 0.1));
    on(q(scene, "[data-wf-workspace-panel-close]"), "click", () => closeWorkspacePanel(scene, true));
    on(q(scene, "[data-wf-replay-run]"), "click", () => {
      closeWorkspacePanel(scene);
      renderStep(0);
      resume();
    });

    setCanvasZoom(scene, 1);
  }

  on(demo, "keydown", (event) => {
    if (event.key !== "Escape") return;
    closeNodePanels(activeScene(), true);
    closeNodePicker(activeScene());
    closeWorkspacePanel(activeScene(), true);
  });

  on(viewport, "scroll", () => chrome(activeScene()), true);
  window.addEventListener("resize", () => chrome(activeScene()), { signal, passive: true });

  on(playButton, "click", () => {
    playing = !playing;
    if (playing && step >= stageCount(activeScene())) renderStep(-1);
    updatePlayButton();
  });

  reducedMotion.addEventListener(
    "change",
    (event) => {
      if (!event.matches) return;
      playing = false;
      renderStep(stageCount(activeScene()));
      updatePlayButton();
    },
    { signal },
  );

  setScene(activeSceneId, false);
  renderStep(reducedMotion.matches ? stageCount(activeScene()) : -1);
  updatePlayButton();

  const timer = window.setInterval(() => {
    if (!demo.isConnected) {
      window.clearInterval(timer);
      return;
    }
    advance();
  }, TICK_MS);

  return () => {
    abort.abort();
    window.clearInterval(timer);
    timeouts.forEach((id) => window.clearTimeout(id));
    frames.forEach((id) => window.cancelAnimationFrame(id));
    delete demo.dataset.wfInitialized;
  };
}
