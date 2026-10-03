"use client";

import { useRef } from "react";
import { useErpObserver } from "@/components/erp/shared/useErpObserver";
import { usePageNav } from "@/components/erp/shared/usePageNav";
import { ArchitectureSection } from "./sections/ArchitectureSection";
import { CallerTaxonomySection, ClientModelSection } from "./sections/CallersSections";
import { CapabilitiesSection } from "./sections/CapabilitiesSection";
import { AgentsDetailsSection, AgentsUsersSection, HumanVsAgentSection } from "./sections/ClientsSections";
import { CtaSection, ThesisSection } from "./sections/ClosingSections";
import { HeroSection } from "./sections/HeroSection";
import { IdeaSection, WhyNowSection } from "./sections/IdeaSections";
import { PageNavSection } from "./sections/PageNavSection";
import { RequestPathSection, SharedServicesSection } from "./sections/RequestPathSections";

/**
 * Main content of erpai.studio/headless-saas (clone route /erpai/headless-saas): the hero, the
 * sticky in-page nav and the 13 content sections. Scroll reveals (data-observe in #agent-economy)
 * run through useErpObserver; the anchor strip's active link / arrows / data-stuck through
 * usePageNav. Everything else on this page is static markup.
 */
export function HeadlessSaasMain() {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useErpObserver(mainRef);
  usePageNav(navRef);

  return (
    <main
      ref={mainRef}
      id="main-content"
      className="flex-1 proto-saas tacet-chrome-page tacet-headless-saas-page tacet-motion-restrained"
    >
      <HeroSection />
      <PageNavSection navRef={navRef} />
      <IdeaSection />
      <WhyNowSection />
      <ArchitectureSection />
      <AgentsUsersSection />
      <HumanVsAgentSection />
      <AgentsDetailsSection />
      <CapabilitiesSection />
      <CallerTaxonomySection />
      <ClientModelSection />
      <RequestPathSection />
      <SharedServicesSection />
      <ThesisSection />
      <CtaSection />
    </main>
  );
}
