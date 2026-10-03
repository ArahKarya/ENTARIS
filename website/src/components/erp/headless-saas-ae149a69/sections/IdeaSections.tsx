/** #the-idea — definition copy + pull quote. */
export function IdeaSection() {
  return (
    <section id="the-idea" className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="border-b border-[var(--border)] border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 max-w-[90rem] mx-auto">
          <div className="lg:col-span-8 px-6 lg:px-12 pt-12 lg:pt-16 pb-12 lg:pb-16 lg:border-r border-[var(--border)]">
            <div className="proto-section-eyebrow">
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">
                  The idea
                </span>
                <span className="proto-section-eyebrow__context">
                  One platform, several clients
                </span>
              </span>
            </div>
            <h2 className="font-heading text-2xl lg:text-3xl uppercase mb-6" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
               What we mean by Headless SaaS 
            </h2>
            <div className="prose-content text-sm lg:text-base leading-relaxed max-w-[65ch]" style={{ fontFamily: "var(--font-body)", color: "var(--foreground)" }}>
              <p>
                ERP.AI keeps business capabilities in shared backend services instead of locking them inside one screen. Apps, tables, records, views, forms, workflows, reports, documents, pages, roles, and hosting metadata are handled by those services.
              </p>
              <p style={{ marginTop: "1rem" }}>
                The ERP.AI web app uses them. Proto uses them through its ERP.AI actions. Hosted pages and approved integrations use the same service boundary with their own identity and permissions.
              </p>
              <p style={{ marginTop: "1rem" }}>
                <strong>
                  Headless does not mean there is no interface.
                </strong>
                 ERP.AI includes a full web product. It means the interface is one client of the platform, not the only place where the work can happen.
              </p>
            </div>
          </div>
          <div className="lg:col-span-4 px-6 lg:px-8 py-12 lg:py-16 flex items-center" style={{ background: "var(--card)" }}>
            <blockquote className="relative">
              <span className="font-heading text-6xl leading-none absolute -top-4 -left-2" style={{ color: "var(--red-on-light)", opacity: "0.3" }} aria-hidden="true">
                {" \" "}
              </span>
              <p className="font-serif italic text-lg lg:text-xl leading-snug pl-4" style={{ color: "var(--foreground)" }}>
                 The web app, Proto, and approved integrations use the same governed platform services. 
              </p>
              <cite className="block mt-4 pl-4 font-mono text-label uppercase tracking-label not-italic" style={{ color: "var(--text-m)" }}>
                 ERP.AI product model 
              </cite>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #why-now — three numbered reasons. */
export function WhyNowSection() {
  return (
    <section id="why-now" className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="px-6 lg:px-12 pt-16 pb-8">
        <h2 className="font-heading text-2xl lg:text-4xl uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
          <span data-line="">
            Why the shared service layer matters
          </span>
        </h2>
      </div>
      <div className="px-6 lg:px-12 pb-16 lg:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 border-t border-b border-[var(--border)] group">
          <div className="lg:col-span-1 flex flex-col items-center justify-center py-6 lg:py-8 border-b lg:border-b-0 lg:border-r border-[var(--border)] gap-1" style={{ background: "color-mix(in oklch, var(--org), transparent 85%)" }}>
            <span className="font-mono text-label uppercase tracking-label" style={{ color: "var(--text-m)" }}>
               Reason 
            </span>
            <span className="font-heading text-4xl" style={{ fontWeight: "900", color: "var(--foreground)", mixBlendMode: "normal", opacity: "1" }}>
               1 
            </span>
          </div>
          <div className="lg:col-span-11 px-6 lg:px-8 py-6 lg:py-8 flex flex-stack justify-center">
            <h3 className="font-heading text-lg uppercase mb-2" style={{ fontWeight: "900", color: "var(--foreground)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-layout-list headless-layer-icon headless-layer-icon--heading" data-icon="layout-list" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2" />
                <path d="M4 16a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2" />
              </svg>
               The web product stays complete 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               People can build and run apps through tables, forms, dashboards, reports, workflows, documents, custom pages, and administration screens. Programmatic access does not replace that product. 
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-[var(--border)] group">
          <div className="lg:col-span-1 flex flex-col items-center justify-center py-6 lg:py-8 border-b lg:border-b-0 lg:border-r border-[var(--border)] gap-1" style={{ background: "color-mix(in oklch, var(--org), transparent 85%)" }}>
            <span className="font-mono text-label uppercase tracking-label" style={{ color: "var(--text-m)" }}>
               Reason 
            </span>
            <span className="font-heading text-4xl" style={{ fontWeight: "900", color: "var(--foreground)", mixBlendMode: "normal", opacity: "1" }}>
               2 
            </span>
          </div>
          <div className="lg:col-span-11 px-6 lg:px-8 py-6 lg:py-8 flex flex-stack justify-center">
            <h3 className="font-heading text-lg uppercase mb-2" style={{ fontWeight: "900", color: "var(--foreground)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-shield-check headless-layer-icon headless-layer-icon--heading" data-icon="shield-check" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" />
                <path d="M15 19l2 2l4 -4" />
              </svg>
               Access rules stay in one place 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               The gateway resolves identity and tenant context. The service that owns the requested resource checks access before it performs the operation. 
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 border-b border-[var(--border)] group">
          <div className="lg:col-span-1 flex flex-col items-center justify-center py-6 lg:py-8 border-b lg:border-b-0 lg:border-r border-[var(--border)] gap-1" style={{ background: "color-mix(in oklch, var(--org), transparent 85%)" }}>
            <span className="font-mono text-label uppercase tracking-label" style={{ color: "var(--text-m)" }}>
               Reason 
            </span>
            <span className="font-heading text-4xl" style={{ fontWeight: "900", color: "var(--foreground)", mixBlendMode: "normal", opacity: "1" }}>
               3 
            </span>
          </div>
          <div className="lg:col-span-11 px-6 lg:px-8 py-6 lg:py-8 flex flex-stack justify-center">
            <h3 className="font-heading text-lg uppercase mb-2" style={{ fontWeight: "900", color: "var(--foreground)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-plug headless-layer-icon headless-layer-icon--heading" data-icon="plug" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054" />
                <path d="M4 20l3.5 -3.5" />
                <path d="M15 4l-3.5 3.5" />
                <path d="M20 9l-3.5 3.5" />
              </svg>
               Other clients do not need to copy the product 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Proto, hosted pages, external apps, and approved integrations can use the platform services without recreating ERP.AI business logic in each client. 
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
