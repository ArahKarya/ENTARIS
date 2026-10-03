import Link from "next/link";
import { toCloneHref } from "../../shared/links";

/* m05 — #operations-handoff: copy + CTA buttons beside the handoff record list. */
type RecordEntry = { term: string; detail: string };

const RECORD_ENTRIES: readonly RecordEntry[] = [
  { term: "Incident", detail: "Severity, impact, owner, response, follow-up" },
  { term: "Change", detail: "Risk, approval, release window, rollback state" },
  { term: "Security", detail: "Principal, event, policy result, export destination" },
  { term: "Review", detail: "Open decisions, capacity, exceptions, roadmap owner" },
];

export function EnterpriseOperations() {
  return (
    <section id="operations-handoff" className="role-section role-section--quiet enterprise-operations">
      <div className="enterprise-operations__copy">
        <p className="role-kicker">Operations handoff</p>
        <h2>When a control fires, the owner is already named.</h2>
        <p>
          User, account, workflow, and deployment events can feed incident, change, release, and review work. The owning service determines which details are available.
        </p>
        <div className="enterprise-operations__actions">
          <Link href={toCloneHref("/contact")} className="btn btn--primary btn--lg">
            Contact sales
          </Link>
          <Link href={toCloneHref("/pricing")} className="btn btn--secondary btn--lg">
            Review pricing
          </Link>
        </div>
      </div>
      <dl className="enterprise-operations__record">
        {RECORD_ENTRIES.map((entry) => (
          <div key={entry.term}>
            <dt>{entry.term}</dt>
            <dd>{entry.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
