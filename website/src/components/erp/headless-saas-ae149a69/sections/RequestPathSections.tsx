import type { CSSProperties } from "react";

/** #agent-economy — request path steps (data-observe reveals). */
export function RequestPathSection() {
  return (
    <section id="agent-economy" className="border-b border-[var(--border)]" style={{ background: "var(--card)" }}>
      <div className="px-6 lg:px-12 pt-16 pb-8">
        <div className="proto-section-eyebrow" data-observe="reveal-up">
          <span className="proto-section-eyebrow__rail" aria-hidden="true" />
          <span className="proto-section-eyebrow__copy">
            <span className="proto-section-eyebrow__name">
              Request path
            </span>
            <span className="proto-section-eyebrow__context">
              What happens when a client asks for work
            </span>
          </span>
        </div>
        <h2 className="font-heading text-2xl lg:text-4xl uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }} data-observe="signature-reveal">
          <span data-line="" style={{ "--stagger-index": "0" } as CSSProperties}>
            A request has an owner
          </span>
        </h2>
        <div className="prose-content text-sm lg:text-base leading-relaxed max-w-[65ch] mt-6" style={{ fontFamily: "var(--font-body)", color: "var(--foreground)" }} data-observe="reveal-up">
          <p>
            ERP.AI does not treat every capability as one generic endpoint. A request moves through the gateway to the service that owns the resource.
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--border)]" data-observe="stagger">
        <div className="grid grid-cols-[120px_1fr] lg:grid-cols-[220px_1fr] border-b border-[var(--border)]" data-observe="reveal-up" style={{ "--stagger-index": "0" } as CSSProperties}>
          <div className="pl-6 lg:pl-12 pr-3 lg:pr-4 py-6 lg:py-8 border-r border-[var(--border)] flex items-start pt-6 lg:pt-8">
            <span className="font-heading text-xl lg:text-2xl uppercase leading-none" style={{ fontWeight: "900", color: "var(--red-on-light)", letterSpacing: "-0.02em" }}>
               01 
            </span>
          </div>
          <div className="px-6 lg:px-12 py-6 lg:py-8">
            <h3 className="font-heading text-sm uppercase mb-2" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Resolve the caller 
            </h3>
            <p className="text-xs lg:text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               The gateway resolves identity and organization context from the configured sign-in or service credential. 
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[120px_1fr] lg:grid-cols-[220px_1fr] border-b border-[var(--border)]" data-observe="reveal-up" style={{ "--stagger-index": "1" } as CSSProperties}>
          <div className="pl-6 lg:pl-12 pr-3 lg:pr-4 py-6 lg:py-8 border-r border-[var(--border)] flex items-start pt-6 lg:pt-8">
            <span className="font-heading text-xl lg:text-2xl uppercase leading-none" style={{ fontWeight: "900", color: "var(--red-on-light)", letterSpacing: "-0.02em" }}>
               02 
            </span>
          </div>
          <div className="px-6 lg:px-12 py-6 lg:py-8">
            <h3 className="font-heading text-sm uppercase mb-2" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Check the requested resource 
            </h3>
            <p className="text-xs lg:text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               The owning service checks access to the app and the requested table, record, workflow, page, role, or other resource. 
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[120px_1fr] lg:grid-cols-[220px_1fr] border-b border-[var(--border)]" data-observe="reveal-up" style={{ "--stagger-index": "2" } as CSSProperties}>
          <div className="pl-6 lg:pl-12 pr-3 lg:pr-4 py-6 lg:py-8 border-r border-[var(--border)] flex items-start pt-6 lg:pt-8">
            <span className="font-heading text-xl lg:text-2xl uppercase leading-none" style={{ fontWeight: "900", color: "var(--red-on-light)", letterSpacing: "-0.02em" }}>
               03 
            </span>
          </div>
          <div className="px-6 lg:px-12 py-6 lg:py-8">
            <h3 className="font-heading text-sm uppercase mb-2" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Perform the operation 
            </h3>
            <p className="text-xs lg:text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               The service validates the request, applies its business rules, and reads or writes the authoritative store. 
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[120px_1fr] lg:grid-cols-[220px_1fr] border-b border-[var(--border)]" data-observe="reveal-up" style={{ "--stagger-index": "3" } as CSSProperties}>
          <div className="pl-6 lg:pl-12 pr-3 lg:pr-4 py-6 lg:py-8 border-r border-[var(--border)] flex items-start pt-6 lg:pt-8">
            <span className="font-heading text-xl lg:text-2xl uppercase leading-none" style={{ fontWeight: "900", color: "var(--red-on-light)", letterSpacing: "-0.02em" }}>
               04 
            </span>
          </div>
          <div className="px-6 lg:px-12 py-6 lg:py-8">
            <h3 className="font-heading text-sm uppercase mb-2" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Keep the applicable history 
            </h3>
            <p className="text-xs lg:text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Audit, version, workflow-run, snapshot, or deployment records are written where that product surface supports them. 
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 lg:px-12 py-10 border-t border-[var(--border)] headless-packet-quote-shell" data-observe="reveal-up">
        <blockquote className="relative max-w-[65ch] headless-packet-quote headless-packet-quote--timeline">
          <span className="font-heading text-6xl leading-none absolute -top-4 -left-2" style={{ color: "var(--red-on-light)", opacity: "0.3" }} aria-hidden="true">
             “ 
          </span>
          <p className="font-serif italic text-lg lg:text-xl leading-snug pl-6" style={{ color: "var(--foreground)" }}>
            <span className="block">
              One platform service owns each operation.
            </span>
            <span className="block">
              Every client goes through that boundary.
            </span>
          </p>
          <cite className="block mt-4 pl-6 font-mono text-label uppercase tracking-label not-italic" style={{ color: "var(--text-m)" }}>
             ERP.AI request model 
          </cite>
        </blockquote>
      </div>
    </section>
  );
}

/** #advantages — shared services ledger. */
export function SharedServicesSection() {
  return (
    <section id="advantages" className="headless-benefit-section border-b border-[var(--border)]">
      <header className="headless-section-intro">
        <h2>
          What the shared services provide
        </h2>
        <p>
          {"The value is practical: clients can reuse the product's data model and controls."}
        </p>
      </header>
      <ol className="headless-advantage-ledger">
        <li>
          <span>
            01
          </span>
          <h3>
            One app model
          </h3>
          <p>
             Tables, columns, records, views, forms, workflows, reports, documents, and pages remain part of the same app. 
          </p>
        </li>
        <li>
          <span>
            02
          </span>
          <h3>
            Named callers
          </h3>
          <p>
             People and configured software clients use identities the platform can check and attribute. 
          </p>
        </li>
        <li>
          <span>
            03
          </span>
          <h3>
            Scoped access
          </h3>
          <p>
             Organization, app, role, resource, and action checks stay with the services that own them. 
          </p>
        </li>
        <li>
          <span>
            04
          </span>
          <h3>
            Durable data
          </h3>
          <p>
             PostgreSQL is the authoritative store; an accelerated record path falls back to PostgreSQL when needed. 
          </p>
        </li>
        <li>
          <span>
            05
          </span>
          <h3>
            Shared business rules
          </h3>
          <p>
             Validation and app behavior live in the platform rather than being reimplemented in each client. 
          </p>
        </li>
        <li>
          <span>
            06
          </span>
          <h3>
            Workflow evidence
          </h3>
          <p>
             Supported workflows keep execution state, output, errors, stop and retry controls, and summaries. 
          </p>
        </li>
        <li>
          <span>
            07
          </span>
          <h3>
            Change records
          </h3>
          <p>
             Branches, commits, merges, snapshots, audit events, page versions, and deployment history cover the changes they own. 
          </p>
        </li>
        <li>
          <span>
            08
          </span>
          <h3>
            Hosted output
          </h3>
          <p>
             Pages, portals, external apps, domains, and their identity settings can be managed as product surfaces. 
          </p>
        </li>
        <li>
          <span>
            09
          </span>
          <h3>
            Separate release cycles
          </h3>
          <p>
             The web app, Proto, hosted output, and integrations can evolve without moving business ownership out of the platform services. 
          </p>
        </li>
      </ol>
    </section>
  );
}
