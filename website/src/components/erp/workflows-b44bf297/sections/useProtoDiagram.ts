"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Port of proto-diagram-zoom.js for one `[data-proto-diagram]` shell.
 *
 * useDiagramScrollReveal — initShells() + checkScrollReveal(): marks the shell
 *   data-diagram-ready="true", and on scroll/resize (rAF-throttled, plus once at init and once
 *   250ms after mount) writes data-diagram-in-reading-zone / data-diagram-reveal-done /
 *   data-diagram-active and flashes data-controls-visible="true" for 2200ms when the viewport
 *   enters the reading zone (top: min(160px, 18vh), bottom: 90vh).
 *
 * useDiagramModal — the zoom dialog: openModal() clones the canvas markup into the dialog, adds
 *   `proto-diagram-modal-open` to the root (the source uses <html>/<body>; the scoped CSS maps
 *   them to `.erp-root`), makes the root's other children inert, focuses the close button on the
 *   next tick; zoom ±0.15 within 0.75–2.5, pan ±64px, pointer-drag pan, Reset, Escape/backdrop/✕
 *   close with focus restore, Tab focus trap. The source has no reduced-motion branch.
 */

const MIN_SCALE = 0.75;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;
const PAN_STEP = 64;
const CONTROLS_VISIBLE_MS = 2200;
const INITIAL_REVEAL_MS = 250;
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clearSelection = () => {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) selection.removeAllRanges();
};

export function useDiagramScrollReveal(shellRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (shell.querySelector("[data-diagram-action='open']")) shell.dataset.diagramReady = "true";

    let scrollRaf = 0;
    let controlsTimer = 0;
    const revealForScroll = () => {
      shell.dataset.controlsVisible = "true";
      window.clearTimeout(controlsTimer);
      controlsTimer = window.setTimeout(() => {
        shell.dataset.controlsVisible = "false";
      }, CONTROLS_VISIBLE_MS);
    };

    const checkScrollReveal = () => {
      scrollRaf = 0;
      const topEdge = Math.min(160, window.innerHeight * 0.18);
      const bottomEdge = window.innerHeight * 0.9;
      const viewport = shell.querySelector("[data-proto-diagram-viewport]") ?? shell;
      const rect = viewport.getBoundingClientRect();
      const isVisible = rect.top < bottomEdge && rect.bottom > topEdge;
      const wasVisible = shell.dataset.diagramInReadingZone === "true";
      const alreadyRevealed = shell.dataset.diagramRevealDone === "true";
      const overlap = Math.max(0, Math.min(rect.bottom, bottomEdge) - Math.max(rect.top, topEdge));
      const crossesReadingLine = rect.top <= topEdge && rect.bottom >= topEdge;

      if (isVisible && (!wasVisible || !alreadyRevealed)) {
        revealForScroll();
        shell.dataset.diagramRevealDone = "true";
      }
      if (!isVisible) shell.dataset.diagramRevealDone = "false";
      shell.dataset.diagramInReadingZone = String(isVisible);
      shell.dataset.diagramActive = String(crossesReadingLine && overlap > 0);
    };

    const requestScrollReveal = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(checkScrollReveal);
    };

    window.addEventListener("scroll", requestScrollReveal, { passive: true });
    window.addEventListener("resize", requestScrollReveal);
    requestScrollReveal();
    const initialTimer = window.setTimeout(checkScrollReveal, INITIAL_REVEAL_MS);

    return () => {
      window.removeEventListener("scroll", requestScrollReveal);
      window.removeEventListener("resize", requestScrollReveal);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      window.clearTimeout(initialTimer);
      window.clearTimeout(controlsTimer);
    };
  }, [shellRef]);
}

type ModalController = { open: () => void };

type DiagramModal = {
  /** Portal host for <ProtoDiagramModal>; null until the first open (the source builds it lazily). */
  modalHost: HTMLElement | null;
  modalRef: React.RefObject<HTMLDivElement | null>;
  openModal: () => void;
};

export function useDiagramModal(
  shellRef: React.RefObject<HTMLDivElement | null>,
  rootRef: React.RefObject<HTMLDivElement | null>,
): DiagramModal {
  const [modalHost, setModalHost] = useState<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ModalController | null>(null);
  const pendingOpenRef = useRef(false);

  const openModal = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.open();
      return;
    }
    pendingOpenRef.current = true;
    setModalHost(rootRef.current);
  }, [rootRef]);

  useEffect(() => {
    const modal = modalRef.current;
    const root = rootRef.current;
    const shell = shellRef.current;
    if (!modal || !root || !shell) return;
    const title = modal.querySelector<HTMLElement>(".proto-diagram-modal__title");
    const viewport = modal.querySelector<HTMLElement>("[data-proto-diagram-modal-viewport]");
    const canvas = modal.querySelector<HTMLElement>("[data-proto-diagram-modal-canvas]");
    const status = modal.querySelector<HTMLElement>("[data-proto-diagram-status]");
    if (!viewport || !canvas) return;

    let scale = 1;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastActive: Element | null = null;
    let background: { element: HTMLElement; inert: boolean }[] = [];
    let focusTimer = 0;

    const apply = () => {
      canvas.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
      if (status) status.textContent = `${Math.round(scale * 100)}%`;
    };
    const resetView = () => {
      scale = 1;
      panX = 0;
      panY = 0;
      apply();
    };
    const setScale = (next: number) => {
      scale = clamp(next, MIN_SCALE, MAX_SCALE);
      apply();
    };
    const panBy = (x: number, y: number) => {
      panX += x;
      panY += y;
      apply();
    };

    const isolateBackground = () => {
      background = Array.from(root.children)
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== modal)
        .map((element) => ({ element, inert: element.inert }));
      background.forEach(({ element }) => {
        element.inert = true;
      });
    };
    const restoreBackground = () => {
      background.forEach(({ element, inert }) => {
        if (element.isConnected) element.inert = inert;
      });
      background = [];
    };

    const close = (restoreFocus: boolean) => {
      const wasOpen = !modal.hidden;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      root.classList.remove("proto-diagram-modal-open");
      restoreBackground();
      canvas.innerHTML = "";
      resetView();
      if (restoreFocus && wasOpen && lastActive instanceof HTMLElement && lastActive.isConnected) lastActive.focus();
      lastActive = null;
    };

    const open = () => {
      lastActive = document.activeElement;
      const sourceCanvas = shell.querySelector("[data-proto-diagram-canvas]");
      if (title) title.textContent = shell.dataset.diagramLabel || "Diagram";
      canvas.innerHTML = sourceCanvas ? sourceCanvas.innerHTML : "";
      resetView();
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      root.classList.add("proto-diagram-modal-open");
      isolateBackground();
      // Let the opener click finish before transferring focus into the dialog.
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        if (!modal.hidden) modal.querySelector<HTMLElement>("button[data-diagram-action='close']")?.focus();
      }, 0);
    };

    const onClick = (event: MouseEvent) => {
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-diagram-action]") : null;
      if (!control) return;
      const action = control.dataset.diagramAction;
      if (action === "zoom-in") setScale(scale + SCALE_STEP);
      if (action === "zoom-out") setScale(scale - SCALE_STEP);
      if (action === "reset") resetView();
      if (action === "pan-left") panBy(PAN_STEP, 0);
      if (action === "pan-right") panBy(-PAN_STEP, 0);
      if (action === "close") close(true);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      clearSelection();
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      modal.dataset.diagramDragging = "true";
      viewport.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      event.preventDefault();
      clearSelection();
      panX += event.clientX - lastX;
      panY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      apply();
    };
    const stopDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      modal.dataset.diagramDragging = "false";
      if (event.pointerId && viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    };
    const onLostCapture = () => {
      dragging = false;
      modal.dataset.diagramDragging = "false";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (modal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !modal.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener("click", onClick);
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);
    viewport.addEventListener("lostpointercapture", onLostCapture);
    document.addEventListener("keydown", onKeyDown);
    controllerRef.current = { open };
    if (pendingOpenRef.current) {
      pendingOpenRef.current = false;
      open();
    }

    return () => {
      controllerRef.current = null;
      window.clearTimeout(focusTimer);
      close(false);
      modal.removeEventListener("click", onClick);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", stopDrag);
      viewport.removeEventListener("pointercancel", stopDrag);
      viewport.removeEventListener("lostpointercapture", onLostCapture);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [modalHost, rootRef, shellRef]);

  return { modalHost, modalRef, openModal };
}
