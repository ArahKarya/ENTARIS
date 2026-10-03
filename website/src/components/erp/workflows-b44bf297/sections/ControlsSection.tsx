import { CONTROL_CARDS } from "./controlData";
import { MiniFlow, SectionEyebrow } from "./MiniFlow";

/** m04 — `#controls`: three control cards, each with an expandable mini flow. */
export function ControlsSection() {
  return (
    <section id="controls" className="wf-section">
      <div className="wf-shell">
        <SectionEyebrow name="Controls" context="The operating surface stays visible" />
        <div className="wf-section-head">
          <h2>Build, approve, and release from the same app.</h2>
        </div>
        <div className="wf-control-grid">
          {CONTROL_CARDS.map((card) => (
            <article key={card.eyebrow}>
              <span>{card.eyebrow}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <MiniFlow variant="control" label={card.flowLabel} nodes={card.nodes} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
