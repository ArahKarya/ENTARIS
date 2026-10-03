/* m03 — #policy-path: four control questions along one policy path. */
type PolicyRow = { question: string; title: string; body: string; outcome: string };

const POLICY_ROWS: readonly PolicyRow[] = [
  {
    question: "Who is acting?",
    title: "Identity and access",
    body: "Users, service accounts, directory connections, and role assignments establish the account.",
    outcome: "Resolve before action",
  },
  {
    question: "May it proceed?",
    title: "Policy and approval",
    body: "Role, resource, environment, and human-review requirements determine whether the change moves.",
    outcome: "Hold when unclear",
  },
  {
    question: "Where may it run?",
    title: "Deployment boundary",
    body: "Tenancy, network isolation, region, and secret access define the permitted target.",
    outcome: "Constrain the runtime",
  },
  {
    question: "What remains?",
    title: "Evidence and response",
    body: "Caller, decision, change, result, and escalation route remain available in the owning service.",
    outcome: "Keep the record",
  },
];

export function EnterprisePolicy() {
  return (
    <section id="policy-path" className="role-section role-section--quiet enterprise-policy">
      <header className="role-intro role-intro--narrow">
        <h2>One policy path, four control questions.</h2>
        <p>
          The page follows the same action from request to evidence instead of presenting identity, security, governance, and support as interchangeable feature cards.
        </p>
      </header>
      <div className="enterprise-policy__rows">
        {POLICY_ROWS.map((row) => (
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
