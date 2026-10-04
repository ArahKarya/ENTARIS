import { CtaLink, type CtaSpec } from "./CtaLink";

/* Copy + button on the left, a term/definition list on the right (ported "operations" markup). */
export type RecordEntry = { term: string; detail: string };

type RecordSectionProps = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  cta?: CtaSpec;
  entries: readonly RecordEntry[];
};

export function RecordSection({ id, kicker, title, text, cta, entries }: RecordSectionProps) {
  return (
    <section id={id} className="role-section role-section--quiet enterprise-operations">
      <div className="enterprise-operations__copy">
        <p className="role-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{text}</p>
        {cta ? (
          <div className="enterprise-operations__actions">
            <CtaLink cta={cta} variant="primary" size="lg" />
          </div>
        ) : null}
      </div>
      <dl className="enterprise-operations__record">
        {entries.map((entry) => (
          <div key={entry.term}>
            <dt>{entry.term}</dt>
            <dd>{entry.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
