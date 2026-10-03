"use client";

import { useRef } from "react";
import { useErpObserver } from "../shared/useErpObserver";
import { usePageNav } from "../shared/usePageNav";
import { ProtoExamples } from "./sections/ProtoExamples";
import { ProtoHero } from "./sections/ProtoHero";
import { ProtoPageNav } from "./sections/ProtoPageNav";
import { ProtoProcess } from "./sections/ProtoProcess";
import { ProtoStory } from "./sections/ProtoStory";
import { STORIES } from "./storyData";
import { useDownloadPicker } from "./useDownloadPicker";
import { useProtoMotion } from "./useProtoMotion";

/**
 * Main content of /erpai/proto (erpai.studio/proto): hero (m00), in-page nav (m01), #process (m02),
 * the three sticky story sections #apps / #case-files / #approval (m03–m05) and #tools (m06).
 * Render it between `<PageChrome page={{ current: "proto", notice: null }} />` and the footer.
 */
export function ProtoMain() {
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useErpObserver(mainRef);
  usePageNav(navRef);
  useDownloadPicker(mainRef);
  useProtoMotion(mainRef);

  return (
    <main ref={mainRef} id="main-content" className="flex-1 proto-saas tacet-chrome-page tacet-proto-page tacet-motion-restrained">
      <ProtoHero />
      <ProtoPageNav navRef={navRef} />
      <ProtoProcess />
      {STORIES.map((story) => (
        <ProtoStory key={story.sectionId} story={story} />
      ))}
      <ProtoExamples />
    </main>
  );
}
