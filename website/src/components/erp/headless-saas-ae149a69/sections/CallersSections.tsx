/** #agent-ecosystem — caller taxonomy table. */
export function CallerTaxonomySection() {
  return (
    <section id="agent-ecosystem" className="headless-caller-section border-b border-[var(--border)]">
      <header className="headless-section-intro">
        <h2>
          Clients already accounted for
        </h2>
        <p>
          Each client uses the service it needs and keeps its own interface and release cycle.
        </p>
      </header>
      <div className="headless-caller-taxonomy" role="table" aria-label="Compatible caller taxonomy">
        <div className="headless-caller-taxonomy__row headless-caller-taxonomy__row--head" role="row">
          <span role="columnheader">
            Caller class
          </span>
          <span role="columnheader">
            Typical caller
          </span>
          <span role="columnheader">
            Interface contract
          </span>
          <span role="columnheader">
            Operating note
          </span>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Human interface
          </span>
          <div role="cell">
            <h3>
              ERP.AI web app
            </h3>
          </div>
          <strong role="cell">
            Full product
          </strong>
          <p role="cell">
            The main interface for building apps, working with records, configuring workflows, reading reports, and managing access.
          </p>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Desktop client
          </span>
          <div role="cell">
            <h3>
              Proto
            </h3>
          </div>
          <strong role="cell">
            ERP.AI actions
          </strong>
          <p role="cell">
            The desktop agent can work with apps, tables, records, views, roles, workflows, reports, pages, documents, branches, previews, keys, hosting, and portals through its ERP.AI actions.
          </p>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Hosted interface
          </span>
          <div role="cell">
            <h3>
              Pages and portals
            </h3>
          </div>
          <strong role="cell">
            Renderer
          </strong>
          <p role="cell">
            The renderer serves multi-tenant pages and portals while the platform services keep the underlying data and access rules.
          </p>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Standalone product
          </span>
          <div role="cell">
            <h3>
              External apps
            </h3>
          </div>
          <strong role="cell">
            Scoped access
          </strong>
          <p role="cell">
            External apps can be configured in Command Centre with their own authorization, deployment, domains, and audit log.
          </p>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Automated work
          </span>
          <div role="cell">
            <h3>
              Workflows
            </h3>
          </div>
          <strong role="cell">
            Runs and approvals
          </strong>
          <p role="cell">
            Workflow execution keeps run state, node output, errors, stop and retry controls, and summaries for supported workflows.
          </p>
        </div>
        <div className="headless-caller-taxonomy__row" role="row">
          <span className="headless-caller-taxonomy__type" role="cell">
            Connected software
          </span>
          <div role="cell">
            <h3>
              Approved integrations
            </h3>
          </div>
          <strong role="cell">
            Configured identity
          </strong>
          <p role="cell">
            Integrations use configured credentials and the permissions assigned to that caller. They do not bypass the owning service.
          </p>
        </div>
      </div>
    </section>
  );
}

/** #old-vs-new — GUI-first vs API-first comparison. */
export function ClientModelSection() {
  return (
    <section id="old-vs-new" className="headless-benefit-section border-b border-[var(--border)]">
      <header className="headless-section-intro">
        <h2>
          One platform, different clients
        </h2>
        <p>
          The product keeps one set of business services while clients choose the interface they need.
        </p>
      </header>
      <div className="headless-comparison" role="table" tabIndex={0} aria-label="Old and headless SaaS operating models">
        <div className="headless-comparison__row headless-comparison__row--head" role="row">
          <span role="columnheader">
            Dimension
          </span>
          <span role="columnheader">
            GUI-first
          </span>
          <span role="columnheader">
            API-first
          </span>
          <span role="columnheader">
            Practical shift
          </span>
        </div>
        <div className="headless-comparison__row" role="row">
          <div role="rowheader" data-label="Dimension">
            <h3>
              Product use
            </h3>
          </div>
          <p role="cell" data-label="GUI-first">
            A person uses the ERP.AI web app to build, review, and operate an app.
          </p>
          <p role="cell" data-label="API-first">
            Proto, a hosted page, an external app, or an approved integration can perform permitted work through the same platform services.
          </p>
          <p role="cell" data-label="Practical shift">
            <strong>
              The interface changes; the owning services and permission checks do not.
            </strong>
          </p>
        </div>
        <div className="headless-comparison__row" role="row">
          <div role="rowheader" data-label="Dimension">
            <h3>
              Identity
            </h3>
          </div>
          <p role="cell" data-label="GUI-first">
            A signed-in user carries organization membership and assigned roles.
          </p>
          <p role="cell" data-label="API-first">
            A configured software caller uses its own credential and assigned scope.
          </p>
          <p role="cell" data-label="Practical shift">
            <strong>
              {"Each caller is identified and checked instead of borrowing a person's browser session."}
            </strong>
          </p>
        </div>
        <div className="headless-comparison__row" role="row">
          <div role="rowheader" data-label="Dimension">
            <h3>
              Operations
            </h3>
          </div>
          <p role="cell" data-label="GUI-first">
            A person starts work from a table, form, report, workflow, or settings page.
          </p>
          <p role="cell" data-label="API-first">
            A connected client asks the owning service to perform a supported operation.
          </p>
          <p role="cell" data-label="Practical shift">
            <strong>
              Business rules stay in the service instead of being copied into every client.
            </strong>
          </p>
        </div>
      </div>
    </section>
  );
}
