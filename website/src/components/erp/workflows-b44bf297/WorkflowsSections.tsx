"use client";

import { AppsPluginsSection } from "./sections/AppsPluginsSection";
import { ArchitectureSection } from "./sections/ArchitectureSection";
import { ControlsSection } from "./sections/ControlsSection";
import { FinalSection } from "./sections/FinalSection";
import { PageNavSection } from "./sections/PageNavSection";
import { WorkflowRunSection } from "./sections/WorkflowRunSection";

/**
 * /workflows `<main>` content after the hero (m01–m06). Each section owns its behavior:
 * m01 usePageNav, m02 story + mini flows + approvals, m03 mini flows + Plugin browser,
 * m04 mini flows, m05 observer reveals + diagram zoom, m06 static. Must render inside <ErpRoot>.
 */
export function WorkflowsSections() {
  return (
    <>
      <PageNavSection />
      <WorkflowRunSection />
      <AppsPluginsSection />
      <ControlsSection />
      <ArchitectureSection />
      <FinalSection />
    </>
  );
}
