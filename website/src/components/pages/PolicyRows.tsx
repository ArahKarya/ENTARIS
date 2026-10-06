/* A list of questions answered along one control path (ported "enterprise policy rows" markup). */
export type PolicyRow = { question: string; title: string; body: string; outcome: string };

type PolicyRowsProps = { id: string; title: string; lead: string; rows: readonly PolicyRow[] };

export function PolicyRows({ id, title, lead, rows }: PolicyRowsProps) {
  return (
    <section id={id} className="role-section role-section--quiet enterprise-policy">
      <header className="role-intro role-intro--narrow">
        <h2>{title}</h2>
        <p>{lead}</p>
      </header>
      <div className="enterprise-policy__rows">
        {rows.map((row) => (
          <article key={row.title}>
            <span>{row.question}</span>
            <h3>{row.title}</h3>
            <p>{row.body}</p>
            <strong>{row.outcome}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
