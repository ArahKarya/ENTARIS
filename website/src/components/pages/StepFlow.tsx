import { Fragment } from "react";

/* A numbered flow in the ported control-map card UI (cards joined by arrows). */
export type FlowStep = { label: string; title: string; body: string };

/** Card variants cycle through the design system's identity → action → gate → target styling. */
const VARIANTS = ["identity", "action", "gate", "target"] as const;

type StepFlowProps = {
  id: string;
  kicker: string;
  title: string;
  lead?: string;
  caption: { label: string; title: string };
  steps: readonly FlowStep[];
  /** Optional evidence row under the cards ("Hasilnya: …"). */
  results?: { label: string; items: readonly string[] };
};

export function StepFlow({ id, kicker, title, lead, caption, steps, results }: StepFlowProps) {
  // With three steps the highlighted "gate" card should land on the last-but-one, as with four.
  const variants = steps.length === 3 ? (["identity", "gate", "target"] as const) : VARIANTS;
  return (
    <section id={id} className="role-section enterprise-map-section">
      <header className="role-intro">
        <p className="role-kicker">{kicker}</p>
        <h2>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </header>
      <figure className="enterprise-map pg-flow" data-observe="reveal-up">
        <figcaption>
          <span>{caption.label}</span>
          <strong>{caption.title}</strong>
        </figcaption>
        <div className="enterprise-map__canvas">
          {steps.map((step, index) => (
            <Fragment key={step.title}>
              {index > 0 ? (
                <span className="enterprise-map__edge" aria-hidden="true">
                  →
                </span>
              ) : null}
              <article className={`enterprise-map__node enterprise-map__node--${variants[index % variants.length]}`}>
                <span>{step.label}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            </Fragment>
          ))}
        </div>
        {results ? (
          <div className="enterprise-map__evidence">
            <strong>{results.label}</strong>
            {results.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
      </figure>
    </section>
  );
}
