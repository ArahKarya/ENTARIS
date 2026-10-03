"use client";

import { useRef } from "react";
import { useErpObserver } from "../shared/useErpObserver";
import { usePageNav } from "../shared/usePageNav";
import { SelfHostedHero } from "./sections/SelfHostedHero";
import { SelfHostedPageNav } from "./sections/SelfHostedPageNav";
import { SelfHostedArchitecture } from "./sections/SelfHostedArchitecture";
import { SelfHostedControls } from "./sections/SelfHostedControls";
import { SelfHostedDeployment } from "./sections/SelfHostedDeployment";
import { SelfHostedOperations } from "./sections/SelfHostedOperations";
import { SelfHostedCta } from "./sections/SelfHostedCta";

/*
 * Main content of /self-hosted: hero, sticky in-page nav and five sections. Built on the ported
 * enterprise-page markup (class names kept so the precompiled design system styles it); the nav
 * owns --chrome-height (which sizes the hero's viewport fill).
 */
export function SelfHostedMain() {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useErpObserver(mainRef);
  usePageNav(navRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 proto-saas tacet-chrome-page tacet-enterprise-page sh-page">
      <SelfHostedHero />
      <SelfHostedPageNav navRef={navRef} />
      <SelfHostedArchitecture />
      <SelfHostedControls />
      <SelfHostedDeployment />
      <SelfHostedOperations />
      <SelfHostedCta />
    </main>
  );
}
