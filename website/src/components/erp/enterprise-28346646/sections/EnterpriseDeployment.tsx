/* m04 — #deployment-model: deployment comparison matrix. */
type DeploymentRow = { model: string; boundary: string; control: string; operations: string };

const HEAD_CELLS: readonly string[] = ["Model", "Runtime boundary", "Customer control", "Operations"];

const DEPLOYMENT_ROWS: readonly DeploymentRow[] = [
  {
    model: "Shared SaaS",
    boundary: "Multi-tenant platform",
    control: "Identity, policy, exports",
    operations: "ERP.AI operated",
  },
  {
    model: "Isolated runtime",
    boundary: "Dedicated network and compute, if contracted",
    control: "Network, identity, deployment policy",
    operations: "Jointly governed",
  },
  {
    model: "Dedicated instance",
    boundary: "Single-tenant application and data, if contracted",
    control: "Region, keys, access, release gates",
    operations: "Contract-defined",
  },
];

export function EnterpriseDeployment() {
  return (
    <section id="deployment-model" className="role-section enterprise-deployment">
      <header className="role-intro">
        <p className="role-kicker">Deployment comparison</p>
        <h2>Choose the boundary that matches the operating model.</h2>
        <p>
          The product repositories support shared and dedicated deployment patterns. The actual boundary, ownership, service level, and compliance scope must be confirmed in the contract.
        </p>
      </header>
      <div className="enterprise-deployment__matrix" aria-label="Enterprise deployment comparison">
        <div className="enterprise-deployment__row enterprise-deployment__row--head">
          {HEAD_CELLS.map((cell) => (
            <span key={cell}>{cell}</span>
          ))}
        </div>
        {DEPLOYMENT_ROWS.map((row) => (
          <div key={row.model} className="enterprise-deployment__row">
            <strong>{row.model}</strong>
            <span>{row.boundary}</span>
            <span>{row.control}</span>
            <span>{row.operations}</span>
          </div>
        ))}
      </div>
      <p className="enterprise-deployment__note">
        Certification coverage, availability commitments, recovery objectives, and response targets are confirmed in the applicable order form and service documentation.
      </p>
    </section>
  );
}
