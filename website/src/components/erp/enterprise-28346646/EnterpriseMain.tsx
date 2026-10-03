"use client";

import { useRef } from "react";
import { useErpObserver } from "../shared/useErpObserver";
import { usePageNav } from "../shared/usePageNav";
import { EnterpriseHero } from "./sections/EnterpriseHero";
import { EnterprisePageNav } from "./sections/EnterprisePageNav";
import { EnterpriseMap } from "./sections/EnterpriseMap";
import { EnterprisePolicy } from "./sections/EnterprisePolicy";
import { EnterpriseDeployment } from "./sections/EnterpriseDeployment";
import { EnterpriseOperations } from "./sections/EnterpriseOperations";
import { EnterpriseCta } from "./sections/EnterpriseCta";

/*
 * Main content of erpai.studio/enterprise (clone route /erpai/enterprise): hero, sticky in-page
 * nav and five sections. Render it inside <ErpRoot home={false}> after <PageChrome …/>; the nav
 * owns --chrome-height (which sizes the hero's viewport fill) and the hero parallax var.
 */
export function EnterpriseMain() {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useErpObserver(mainRef);
  usePageNav(navRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 proto-saas tacet-chrome-page tacet-enterprise-page">
      <EnterpriseHero />
      <EnterprisePageNav navRef={navRef} />
      <EnterpriseMap />
      <EnterprisePolicy />
      <EnterpriseDeployment />
      <EnterpriseOperations />
      <EnterpriseCta />
    </main>
  );
}
