import { Fragment } from "react";

/* m02 — #control-map: the identity → access → change → record sequence. */
type MapNode = { variant: string; label: string; title: string; body: string };

const MAP_NODES: readonly MapNode[] = [
  {
    variant: "identity",
    label: "Identity",
    title: "User or service account",
    body: "The platform resolves the account and organization first.",
  },
  {
    variant: "action",
    label: "Requested change",
    title: "App operation",
    body: "The request identifies the app, record, and intended change.",
  },
  {
    variant: "gate",
    label: "Access check",
    title: "Role and permission",
    body: "The change continues only when the account has the required access.",
  },
  {
    variant: "target",
    label: "Deployment target",
    title: "Allowed app and environment",
    body: "The change stays inside the selected organization, app, and deployment.",
  },
];

const EVIDENCE_ITEMS: readonly string[] = [
  "identity",
  "policy decision",
  "record change",
  "deployment target",
  "support route",
];

export function EnterpriseMap() {
  return (
    <section id="control-map" className="role-section enterprise-map-section">
      <header className="role-intro">
        <p className="role-kicker">Control map · Product path</p>
        <h2>See the checks around a protected change.</h2>
        <p>
          Enterprise control starts with the account, checks its role and app access, limits where the change may run, and keeps a record of the result.
        </p>
      </header>
      <figure className="enterprise-map" data-observe="reveal-up">
        <figcaption>
          <span>Control sequence</span>
          <strong>Identity → access → change → record</strong>
          <span className="role-state">Product path</span>
        </figcaption>
        <div className="enterprise-map__canvas">
          {MAP_NODES.map((node, index) => (
            <Fragment key={node.variant}>
              {index > 0 ? (
                <span className="enterprise-map__edge" aria-hidden="true">
                  →
                </span>
              ) : null}
              <article className={`enterprise-map__node enterprise-map__node--${node.variant}`}>
                <span>{node.label}</span>
                <strong>{node.title}</strong>
                <p>{node.body}</p>
              </article>
            </Fragment>
          ))}
        </div>
        <div className="enterprise-map__evidence">
          <strong>Evidence return</strong>
          {EVIDENCE_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </figure>
    </section>
  );
}
