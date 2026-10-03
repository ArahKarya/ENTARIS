"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { initWorkflowDemo } from "./workflowDemoController";

/*
 * Client island for the hero editor: renders the `[data-wf-demo]` root around the
 * server-rendered switcher + scenes and runs the workflow-motion.js port on it. The subtree is
 * static React output, so the controller's DOM writes (classes, text, hidden, inline position)
 * never fight a re-render; the teardown removes every listener and timer.
 */
export function WorkflowDemo({ activeScene, children }: { activeScene: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const demo = ref.current;
    if (!demo) return;
    return initWorkflowDemo(demo);
  }, []);

  return (
    <div
      ref={ref}
      className="wf-product"
      data-wf-demo=""
      data-active-scene={activeScene}
      data-playing="true"
      aria-label="Interactive ERP.AI workflow editor"
    >
      {children}
    </div>
  );
}
