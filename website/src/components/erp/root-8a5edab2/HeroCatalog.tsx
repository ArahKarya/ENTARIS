"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CP_HREF, CP_LABEL, DEMO_HREF, DEMO_LABEL } from "@/components/site/siteConfig";
import { Icon } from "@/components/home/HomeIcons";
import { AiraMark } from "@/components/site/AiraLogo";
import { AGENT_PANEL, HUMAN_PANEL } from "@/components/home/homeContent";
import { HeroFlowDiagram, useHeroFlowClock } from "./HeroFlowDiagram";
import { getHeadlineLineRanges, initialView, startGlitch } from "@/components/home/heroGlitch";
import type { GlitchController, GlitchView } from "@/components/home/heroGlitch";

/*
 * header#home-top: the two-panel hero: the human layer (the ERP modules your team uses) and
 * the agent layer (AIRA). Headlines scramble between a few words on the same beat.
 */

const PANELS = [HUMAN_PANEL, AGENT_PANEL] as const;
const ARROW_STYLE: CSSProperties = { width: "16px", height: "16px" };

function GlitchWords({ view }: { view: GlitchView }) {
  const ranges = getHeadlineLineRanges(view.target);
  if (ranges.length <= 1) return <>{view.text}</>;
  return (
    <>
      {ranges.map((range, i) => (
        <span key={i} className="hero-headline__line">
          {view.text.slice(range.start, range.end)}
        </span>
      ))}
    </>
  );
}

function headlineClass(view: GlitchView): string {
  const stacked = getHeadlineLineRanges(view.target).length > 1;
  return "hero-catalog__headline font-display" + (stacked ? " is-stacked" : "");
}

function headlineStyle(view: GlitchView): CSSProperties {
  return {
    "--hero-headline-fit": view.fit,
    "--hero-headline-lines": String(getHeadlineLineRanges(view.target).length),
  } as CSSProperties;
}

function descriptionClass(view: GlitchView): string {
  return "hero-catalog__description" + (view.subGlitching ? " is-glitching" : "");
}

export function HeroCatalog() {
  const heroRef = useRef<HTMLElement>(null);
  const humanHeadlineRef = useRef<HTMLHeadingElement>(null);
  const agentHeadlineRef = useRef<HTMLHeadingElement>(null);
  const [views, setViews] = useState<GlitchView[]>(() => PANELS.map(initialView));
  const glitchRef = useRef<GlitchController | null>(null);
  const flowClock = useHeroFlowClock();

  useEffect(() => {
    const hero = heroRef.current;
    const human = humanHeadlineRef.current;
    const agent = agentHeadlineRef.current;
    if (!hero || !human || !agent) return;
    const update = (index: number, patch: Partial<GlitchView>) => {
      setViews((prev) => prev.map((view, i) => (i === index ? { ...view, ...patch } : view)));
    };
    const controller = startGlitch(hero, [human, agent], PANELS, update);
    glitchRef.current = controller;
    return () => {
      glitchRef.current = null;
      controller.stop();
    };
  }, []);

  // One pause button (in the diagrams) holds every hero animation, headline rotation included.
  useEffect(() => {
    glitchRef.current?.setPaused(flowClock.isPaused);
  }, [flowClock.isPaused]);

  const [human, agent] = views;

  return (
    <header ref={heroRef} id="home-top" className="hero-catalog" aria-label="Entaris untuk tim Anda dan untuk AIRA">
      <div className="hero-catalog__packet" style={{ "--hero-glare-x": "50%", "--hero-glare-y": "50%" } as CSSProperties}>
        <section className="hero-catalog__panel hero-catalog__panel--human" aria-labelledby="hero-human-heading">
          <div className="hero-catalog__panel-inner">
            <div className="hero-catalog__story hero-catalog__story--human">
              <span className="hero-catalog__eyebrow hero-catalog__eyebrow--human">
                <Icon name="userCheck" className="hero-catalog__layer-icon hero-catalog__layer-icon--human" />
                <span>Untuk tim Anda</span>
              </span>
              <h1 ref={humanHeadlineRef} id="hero-human-heading" className={headlineClass(human)} style={headlineStyle(human)}>
                <span aria-label={human.target}>
                  <GlitchWords view={human} />
                </span>
              </h1>
              <p className={descriptionClass(human)}>{human.sub}</p>
            </div>
            <div className="hero-catalog__cta-row hero-catalog__cta-row--human">
              <a href={DEMO_HREF} target="_blank" rel="noopener noreferrer" className="hero-catalog__cta hero-catalog__cta--primary">
                <span>{DEMO_LABEL}</span>
                <Icon name="arrowRight" style={ARROW_STYLE} />
              </a>
              <Link href="/modul" className="hero-catalog__cta hero-catalog__cta--ghost">
                <span>Jelajahi modul</span>
              </Link>
              <a href={CP_HREF} target="_blank" rel="noopener noreferrer" className="hero-catalog__cta hero-catalog__cta--ghost">
                <span>{CP_LABEL}</span>
              </a>
            </div>
            <HeroFlowDiagram
              kind="human"
              step={flowClock.step}
              isPassing={flowClock.isPassing}
              isPaused={flowClock.isPaused}
              onSelectStep={flowClock.selectStep}
              onTogglePause={flowClock.togglePause}
            />
            <div className="hero-catalog__bottom-ribbon hero-catalog__bottom-ribbon--human">
              <span>Pilih modul, pasang di server Anda, langsung dipakai. Onboarding dan setup kami bantu.</span>
            </div>
          </div>
        </section>
        <section className="hero-catalog__panel hero-catalog__panel--agent" aria-labelledby="hero-agent-heading">
          <div className="hero-catalog__panel-inner">
            <div className="hero-catalog__story hero-catalog__story--agent">
              <span className="hero-catalog__eyebrow hero-catalog__eyebrow--agent">
                <span>Untuk AIRA</span>
                <AiraMark size={16} negative className="hero-catalog__layer-icon hero-catalog__layer-icon--agent" />
              </span>
              <h2 ref={agentHeadlineRef} id="hero-agent-heading" className={headlineClass(agent)} style={headlineStyle(agent)}>
                <span aria-label={agent.target}>
                  <GlitchWords view={agent} />
                </span>
              </h2>
              <p className={descriptionClass(agent)}>{agent.sub}</p>
            </div>
            <div className="hero-catalog__cta-row hero-catalog__cta-row--agent">
              <Link href="/aira" className="hero-catalog__cta hero-catalog__cta--primary">
                <span>Kenali AIRA</span>
              </Link>
              <Link href="/aira#contoh" className="hero-catalog__cta hero-catalog__cta--ghost">
                <span>Lihat contoh tugas</span>
              </Link>
            </div>
            <HeroFlowDiagram
              kind="agent"
              step={flowClock.step}
              isPassing={flowClock.isPassing}
              isPaused={flowClock.isPaused}
              onSelectStep={flowClock.selectStep}
              onTogglePause={flowClock.togglePause}
            />
            <div className="hero-catalog__bottom-ribbon hero-catalog__bottom-ribbon--agent">
              <span>Tanya, analisis, susun draf. Setiap perubahan pembukuan menunggu persetujuan Anda.</span>
            </div>
          </div>
        </section>
      </div>
    </header>
  );
}
