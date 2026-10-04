"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { Icon } from "@/components/home/HomeIcons";
import { AGENT_PANEL, AGENT_STEPS, HUMAN_PANEL, HUMAN_STEPS } from "@/components/home/homeContent";
import type { HeroStep } from "@/components/home/homeContent";
import { getHeadlineLineRanges, initialView, startGlitch } from "@/components/home/heroGlitch";
import type { GlitchView } from "@/components/home/heroGlitch";

/*
 * header#home-top — the two-panel hero: the human layer (the ERP modules your team uses) and
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

function Steps({ steps, label }: { steps: readonly HeroStep[]; label: string }) {
  return (
    <ol className="hero-catalog__steps" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.label}>
          <span>{String(i + 1).padStart(2, "0")}</span>
          <strong>{step.label}</strong>
          <em>{step.detail}</em>
        </li>
      ))}
    </ol>
  );
}

export function HeroCatalog() {
  const heroRef = useRef<HTMLElement>(null);
  const humanHeadlineRef = useRef<HTMLHeadingElement>(null);
  const agentHeadlineRef = useRef<HTMLHeadingElement>(null);
  const [views, setViews] = useState<GlitchView[]>(() => PANELS.map(initialView));

  useEffect(() => {
    const hero = heroRef.current;
    const human = humanHeadlineRef.current;
    const agent = agentHeadlineRef.current;
    if (!hero || !human || !agent) return;
    const update = (index: number, patch: Partial<GlitchView>) => {
      setViews((prev) => prev.map((view, i) => (i === index ? { ...view, ...patch } : view)));
    };
    return startGlitch(hero, [human, agent], PANELS, update);
  }, []);

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
            <div className="hero-catalog__metric">
              <div className="hero-catalog__metric-box">
                <p>
                  <strong>Satu buku besar</strong>
                  {" untuk enam area bisnis."}
                </p>
                <p>Double-entry otomatis di setiap transaksi — selalu seimbang.</p>
              </div>
            </div>
            <Link href={DEMO_HREF} className="hero-catalog__cta">
              <span>Minta demo</span>
              <Icon name="arrowRight" style={ARROW_STYLE} />
            </Link>
            <Steps steps={HUMAN_STEPS} label="Langkah mulai untuk tim" />
          </div>
        </section>
        <section className="hero-catalog__panel hero-catalog__panel--agent" aria-labelledby="hero-agent-heading">
          <div className="hero-catalog__panel-inner">
            <div className="hero-catalog__story hero-catalog__story--agent">
              <span className="hero-catalog__eyebrow hero-catalog__eyebrow--agent">
                <span>Untuk AIRA</span>
                <Icon name="sparkles" className="hero-catalog__layer-icon hero-catalog__layer-icon--agent" />
              </span>
              <h2 ref={agentHeadlineRef} id="hero-agent-heading" className={headlineClass(agent)} style={headlineStyle(agent)}>
                <span aria-label={agent.target}>
                  <GlitchWords view={agent} />
                </span>
              </h2>
              <p className={descriptionClass(agent)}>{agent.sub}</p>
            </div>
            <div className="hero-catalog__metric">
              <div className="hero-catalog__metric-box">
                <p>
                  <strong>Ratusan kemampuan</strong>
                  {" di seluruh modul — bisa diatur per peran."}
                </p>
                <p>Setiap perubahan pembukuan menunggu persetujuan Anda.</p>
              </div>
            </div>
            <Link href="/aira" className="hero-catalog__cta">
              <span className="hero-catalog__cta-group">
                <span>Kenali AIRA</span>
                <Icon name="arrowRight" style={ARROW_STYLE} />
              </span>
            </Link>
            <Steps steps={AGENT_STEPS} label="Langkah kerja bersama AIRA" />
          </div>
        </section>
      </div>
    </header>
  );
}
