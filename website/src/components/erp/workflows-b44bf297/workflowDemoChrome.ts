/*
 * DOM helpers of the workflow-motion.js demo (initDemo) that do not depend on the run loop:
 * pinning the editor chrome to the visible part of the horizontally scrolling viewport,
 * canvas zoom, and the draggable canvas notes.
 */

function q(root: ParentNode | null | undefined, selector: string): HTMLElement | null;
function q<T extends Element>(root: ParentNode | null | undefined, selector: string): T | null;
function q(root: ParentNode | null | undefined, selector: string): Element | null {
  return root ? root.querySelector(selector) : null;
}

export { q };

/** positionSceneChrome(): keeps header, add rail, zoom controls, menu and dialogs in view. */
export function positionSceneChrome(scene: HTMLElement | null | undefined, viewport: HTMLElement | null): void {
  if (!scene || !viewport) return;
  const scrollLeft = viewport.scrollLeft;
  const visibleWidth = viewport.clientWidth;
  const header = q(scene, ".erp-workflow-header");
  const addButton = q(scene, "[data-wf-add-node]");
  const canvasControls = q(scene, ".erp-canvas-controls");
  const bottomMenu = q(scene, ".erp-bottom-menu");
  if (header) {
    header.style.left = `${scrollLeft + 12}px`;
    header.style.right = "auto";
    header.style.width = `${Math.max(280, visibleWidth - 24)}px`;
  }
  if (addButton) {
    addButton.style.left = `${scrollLeft + visibleWidth - 48}px`;
    addButton.style.right = "auto";
  }
  if (canvasControls) canvasControls.style.left = `${scrollLeft + 12}px`;
  if (bottomMenu) {
    bottomMenu.style.left = `${scrollLeft + visibleWidth / 2}px`;
    bottomMenu.style.right = "auto";
    bottomMenu.style.transform = "translateX(-50%)";
  }

  const panel = q(scene, "[data-wf-node-panel]:not([hidden])");
  if (panel) {
    const expanded = panel.classList.contains("is-expanded");
    const panelWidth = expanded ? Math.max(288, visibleWidth - 32) : Math.min(480, Math.max(288, visibleWidth - 16));
    panel.style.left = `${scrollLeft + visibleWidth - panelWidth - (expanded ? 16 : 8)}px`;
    panel.style.right = "auto";
    panel.style.width = `${panelWidth}px`;
  }

  const picker = q(scene, "[data-wf-node-picker]:not([hidden])");
  if (picker) {
    const pickerWidth = Math.min(352, Math.max(240, visibleWidth - 32));
    picker.style.left = `${scrollLeft + visibleWidth - pickerWidth - 56}px`;
    picker.style.right = "auto";
    picker.style.width = `${pickerWidth}px`;
  }

  const workspacePanel = q(scene, "[data-wf-workspace-panel-dialog]:not([hidden])");
  if (workspacePanel) {
    const panelWidth = Math.min(368, Math.max(288, visibleWidth - 24));
    workspacePanel.style.left = `${scrollLeft + visibleWidth - panelWidth - 12}px`;
    workspacePanel.style.right = "auto";
    workspacePanel.style.width = `${panelWidth}px`;
  }
}

/** setCanvasZoom(): 0.7–1.3 in 0.1 steps, mirrored on `data-wf-zoom` and `--wf-zoom`. */
export function setCanvasZoom(scene: HTMLElement | null | undefined, nextZoom: number): void {
  const graph = q(scene, "[data-wf-graph]");
  if (!scene || !graph) return;
  const zoom = Math.min(1.3, Math.max(0.7, Math.round(nextZoom * 10) / 10));
  scene.dataset.wfZoom = String(zoom);
  graph.style.setProperty("--wf-zoom", String(zoom));
  const zoomOut = q<HTMLButtonElement>(scene, "[data-wf-zoom-out]");
  const zoomIn = q<HTMLButtonElement>(scene, "[data-wf-zoom-in]");
  if (zoomOut) zoomOut.disabled = zoom <= 0.7;
  if (zoomIn) zoomIn.disabled = zoom >= 1.3;
}

export const sceneZoom = (scene: HTMLElement): number => Number(scene.dataset.wfZoom || 1);

/** Builds a canvas note (static template, no user content) and wires its drag/remove handlers. */
export function createCanvasNote(
  scene: HTMLElement,
  graph: HTMLElement,
  viewport: HTMLElement,
  noteCount: number,
  signal: AbortSignal,
): void {
  const note = document.createElement("article");
  note.className = "erp-canvas-note";
  note.dataset.wfCanvasNote = String(noteCount);
  note.innerHTML = `
        <header data-wf-note-drag>
          <strong>Note ${noteCount}</strong>
          <button type="button" data-wf-note-remove aria-label="Remove note">×</button>
        </header>
        <textarea aria-label="Note text" placeholder="Add context for this workflow…"></textarea>
      `;
  graph.append(note);
  const zoom = sceneZoom(scene);
  const viewportRect = viewport.getBoundingClientRect();
  const graphRect = graph.getBoundingClientRect();
  const visibleCenter = viewportRect.left + viewportRect.width / 2;
  const x = (visibleCenter - graphRect.left) / zoom - 120;
  note.style.left = `${Math.max(16, Math.min(graph.clientWidth - 264, x))}px`;
  note.style.top = `${Math.min(470, 110 + ((noteCount - 1) % 5) * 56)}px`;

  const dragHandle = q(note, "[data-wf-note-drag]");
  let dragState: { pointerX: number; pointerY: number; left: number; top: number } | null = null;
  const opts = { signal };
  dragHandle?.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      dragState = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: Number.parseFloat(note.style.left),
        top: Number.parseFloat(note.style.top),
      };
      dragHandle.setPointerCapture(event.pointerId);
      note.classList.add("is-dragging");
    },
    opts,
  );
  dragHandle?.addEventListener(
    "pointermove",
    (event) => {
      if (!dragState) return;
      const currentZoom = sceneZoom(scene);
      const left = dragState.left + (event.clientX - dragState.pointerX) / currentZoom;
      const top = dragState.top + (event.clientY - dragState.pointerY) / currentZoom;
      note.style.left = `${Math.max(0, Math.min(graph.clientWidth - note.offsetWidth, left))}px`;
      note.style.top = `${Math.max(56, Math.min(graph.clientHeight - note.offsetHeight, top))}px`;
    },
    opts,
  );
  const finishDrag = () => {
    dragState = null;
    note.classList.remove("is-dragging");
  };
  dragHandle?.addEventListener("pointerup", finishDrag, opts);
  dragHandle?.addEventListener("pointercancel", finishDrag, opts);
  q(note, "[data-wf-note-remove]")?.addEventListener("click", () => note.remove(), opts);
  q<HTMLTextAreaElement>(note, "textarea")?.focus({ preventScroll: true });
}
