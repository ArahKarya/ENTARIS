import { ProtoEyebrow } from "./ProtoEyebrow";

/** m02 — #process, static two-column intro. */
export function ProtoProcess() {
  return (
    <section id="process" className="tacet-proto-section">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <ProtoEyebrow name="Process" context="Business process to app surface" />
        <div className="tacet-proto-copy">
          <h2>Start with the records, rules, and approvals.</h2>
          <p>Show Proto the data, people, decisions, and views your team needs.</p>
          <p>
            It drafts the tables, forms, pages, workflows, permissions, and dashboards. Each draft has its own version and release history.
          </p>
        </div>
      </div>
    </section>
  );
}
