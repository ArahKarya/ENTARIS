"use client";

import { useRef } from "react";
import { usePageNav } from "../shared/usePageNav";
import { AiraExamples } from "./sections/AiraExamples";
import { AiraHero } from "./sections/AiraHero";
import { AiraPageNav } from "./sections/AiraPageNav";
import { AiraProcess } from "./sections/AiraProcess";
import { AiraSecurity } from "./sections/AiraSecurity";
import { AiraStory } from "./sections/AiraStory";
import { STORIES } from "./storyData";
import { useAiraMotion } from "./useAiraMotion";

/**
 * Main content of /aira: hero, in-page nav, #cara-kerja, the three sticky stories
 * (#bertanya, #stok, #approval), #keamanan and #contoh. SiteShell supplies nav + footer.
 */
export function AiraMain() {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  usePageNav(navRef);
  useAiraMotion(mainRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 proto-saas tacet-chrome-page tacet-proto-page tacet-motion-restrained aira-page">
      <AiraHero />
      <AiraPageNav navRef={navRef} />
      <AiraProcess />
      {STORIES.map((story) => (
        <AiraStory key={story.sectionId} story={story} />
      ))}
      <AiraSecurity />
      <AiraExamples />
    </main>
  );
}
