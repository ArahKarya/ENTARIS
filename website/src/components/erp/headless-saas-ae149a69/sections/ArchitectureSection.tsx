/** #architecture — service ledger + packet quote. */
export function ArchitectureSection() {
  return (
    <section id="architecture" className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="px-6 lg:px-12 pt-16 pb-8">
        <div className="proto-section-eyebrow">
          <span className="proto-section-eyebrow__rail" aria-hidden="true" />
          <span className="proto-section-eyebrow__copy">
            <span className="proto-section-eyebrow__name">
              Architecture
            </span>
            <span className="proto-section-eyebrow__context">
              The services that exist today
            </span>
          </span>
        </div>
        <h2 className="font-heading text-2xl lg:text-4xl uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
          <span data-line="">
            How ERP.AI is split
          </span>
        </h2>
        <p className="text-sm lg:text-base leading-relaxed mt-4 max-w-[65ch]" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
           Each service owns a clear part of the product. 
        </p>
      </div>
      <div className="px-6 lg:px-12">
        <div className="border-y border-[var(--border)]">
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] border-b border-[var(--border)] group">
            <div className="px-5 lg:px-6 py-5 lg:py-6 lg:border-r border-[var(--border)] flex items-center max-lg:border-b">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-route headless-layer-icon" data-icon="route" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                <path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4" />
                <path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" />
              </svg>
              <span className="font-mono text-label font-bold uppercase tracking-label" style={{ color: "var(--foreground)" }}>
                 Gateway 
              </span>
            </div>
            <div className="px-5 lg:px-6 py-5 lg:py-6 flex flex-stack justify-center">
              <h3 className="font-heading text-base uppercase mb-1" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.01em" }}>
                 Authentication, routing, and limits 
              </h3>
              <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                 The gateway accepts a request, resolves the caller and organization context, routes it to the owning service, and applies configured limits. 
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] border-b border-[var(--border)] group">
            <div className="px-5 lg:px-6 py-5 lg:py-6 lg:border-r border-[var(--border)] flex items-center max-lg:border-b">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-database headless-layer-icon" data-icon="database" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M4 6a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
                <path d="M4 6v6a8 3 0 0 0 16 0v-6" />
                <path d="M4 12v6a8 3 0 0 0 16 0v-6" />
              </svg>
              <span className="font-mono text-label font-bold uppercase tracking-label" style={{ color: "var(--foreground)" }}>
                 App Builder 
              </span>
            </div>
            <div className="px-5 lg:px-6 py-5 lg:py-6 flex flex-stack justify-center">
              <h3 className="font-heading text-base uppercase mb-1" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.01em" }}>
                 Apps, data, and app features 
              </h3>
              <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                 The App Builder API owns apps, schemas, records, views, forms, workflows, reports, documents, pages, hosting metadata, and audit events. PostgreSQL is the durable source of truth. 
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] border-b border-[var(--border)] group">
            <div className="px-5 lg:px-6 py-5 lg:py-6 lg:border-r border-[var(--border)] flex items-center max-lg:border-b">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-lock headless-layer-icon" data-icon="lock" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" />
                <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
                <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
              </svg>
              <span className="font-mono text-label font-bold uppercase tracking-label" style={{ color: "var(--foreground)" }}>
                 Identity 
              </span>
            </div>
            <div className="px-5 lg:px-6 py-5 lg:py-6 flex flex-stack justify-center">
              <h3 className="font-heading text-base uppercase mb-1" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.01em" }}>
                 Organizations, users, and permissions 
              </h3>
              <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                 Herbert handles organizations, users, service accounts, keys, OIDC, SCIM, hosted-app sign-in, domains, and portals. The Permission API owns roles, permissions, assignments, and invitations. 
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] group">
            <div className="px-5 lg:px-6 py-5 lg:py-6 lg:border-r border-[var(--border)] flex items-center max-lg:border-b">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-message-circle headless-layer-icon" data-icon="message-circle" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1" />
              </svg>
              <span className="font-mono text-label font-bold uppercase tracking-label" style={{ color: "var(--foreground)" }}>
                 Agent + pages 
              </span>
            </div>
            <div className="px-5 lg:px-6 py-5 lg:py-6 flex flex-stack justify-center">
              <h3 className="font-heading text-base uppercase mb-1" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.01em" }}>
                 Agent work and hosted output 
              </h3>
              <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                 The Agent API handles conversations, knowledge, app plans, reports, documents, pages, search, and action approvals. The Renderer serves multi-tenant hosted pages and portals. 
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="px-6 lg:px-12 pt-10 pb-12">
        <blockquote className="headless-packet-quote max-w-[720px]">
           The web app is part of this system. Headless access adds other governed clients; it does not remove the product interface. 
        </blockquote>
      </div>
    </section>
  );
}
