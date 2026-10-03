/** #agents-users — people and software intro. */
export function AgentsUsersSection() {
  return (
    <section id="agents-users" className="border-t border-[var(--border)]" style={{ background: "var(--darker)" }}>
      <div className="border-b border-[var(--border)] border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 max-w-[90rem] mx-auto">
          <div className="lg:col-span-12 px-6 lg:px-12 pt-12 lg:pt-16 pb-0">
            <div className="proto-section-eyebrow">
              <span className="proto-section-eyebrow__rail" aria-hidden="true" />
              <span className="proto-section-eyebrow__copy">
                <span className="proto-section-eyebrow__name">
                  Clients
                </span>
                <span className="proto-section-eyebrow__context">
                  Use the right surface for the job
                </span>
              </span>
            </div>
            <h2 className="font-heading text-2xl lg:text-3xl uppercase mb-6" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
               People and software use the same platform 
            </h2>
            <div className="prose-content text-sm lg:text-base leading-relaxed max-w-[65ch]" style={{ fontFamily: "var(--font-body)", color: "var(--foreground)" }}>
              <p>
                The web app is for people who want to work directly with tables, forms, reports, workflows, documents, and settings. Programmatic clients are useful for repeatable work, integrations, hosted experiences, and agent-assisted tasks.
              </p>
              <p style={{ marginTop: "1rem" }}>
                Both paths still need identity, tenant context, resource permissions, validation, and an owning service.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #human-vs-agent — web product vs programmatic clients cards. */
export function HumanVsAgentSection() {
  return (
    <section id="human-vs-agent" style={{ background: "var(--darker)" }}>
      <div className="px-6 lg:px-12 pt-3 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-8 max-md:border-b md:border-r border-[var(--border)]">
            <span className="font-mono text-label font-bold uppercase tracking-label block mb-3" style={{ color: "var(--text-m)" }}>
               Web product 
            </span>
            <h3 className="font-heading text-lg lg:text-xl uppercase mb-4" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.01em" }}>
               For direct work 
            </h3>
            <ul className="flex flex-stack gap-2.5 pl-0" style={{ listStyle: "none" }}>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-table headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="table" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
                  <path d="M3 10h18" />
                  <path d="M10 3v18" />
                </svg>
                 Tables, records, and multiple views 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-file-text headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="file-text" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
                  <path d="M9 9l1 0" />
                  <path d="M9 13l6 0" />
                  <path d="M9 17l6 0" />
                </svg>
                 Forms and record editing 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-chart-line headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="chart-line" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M4 19l16 0" />
                  <path d="M4 15l4 -6l4 2l4 -5l4 4" />
                </svg>
                 Reports and dashboards 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-automation headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="automation" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M13 20.693c-.905 .628 -2.36 .292 -2.675 -1.01a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.492 .362 1.716 2.219 .674 3.03" />
                  <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                  <path d="M17 22l5 -3l-5 -3l0 6" />
                </svg>
                 Workflow building and run history 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-file-text headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="file-text" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
                  <path d="M9 9l1 0" />
                  <path d="M9 13l6 0" />
                  <path d="M9 17l6 0" />
                </svg>
                 Documents and custom pages 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-settings headless-comparison-list-icon headless-comparison-list-icon--human" data-icon="settings" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
                  <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                </svg>
                 Roles, settings, and administration 
              </li>
            </ul>
          </div>
          <div className="p-8">
            <span className="font-mono text-label font-bold uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               Programmatic clients 
            </span>
            <h3 className="font-heading text-lg lg:text-xl uppercase mb-4" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.01em" }}>
               For connected work 
            </h3>
            <ul className="flex flex-stack gap-2.5 pl-0" style={{ listStyle: "none" }}>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-device-desktop headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="device-desktop" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10" />
                  <path d="M7 20h10" />
                  <path d="M9 16v4" />
                  <path d="M15 16v4" />
                </svg>
                 Proto desktop actions 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-world headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="world" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                  <path d="M3.6 9h16.8" />
                  <path d="M3.6 15h16.8" />
                  <path d="M11.5 3a17 17 0 0 0 0 18" />
                  <path d="M12.5 3a17 17 0 0 1 0 18" />
                </svg>
                 Hosted pages and portals 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-braces headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="braces" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2" />
                  <path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2" />
                </svg>
                 External apps 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-plug headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="plug" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054" />
                  <path d="M4 20l3.5 -3.5" />
                  <path d="M15 4l-3.5 3.5" />
                  <path d="M20 9l-3.5 3.5" />
                </svg>
                 Approved integrations 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-clock headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="clock" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                  <path d="M12 7v5l3 3" />
                </svg>
                 Scheduled workflows 
              </li>
              <li className="text-sm leading-relaxed relative pl-6" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-shield-check headless-comparison-list-icon headless-comparison-list-icon--agent" data-icon="shield-check" aria-hidden="true" focusable="false">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06" />
                  <path d="M15 19l2 2l4 -4" />
                </svg>
                 Scoped service identities 
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** #agents-details — access note. */
export function AgentsDetailsSection() {
  return (
    <section id="agents-details" className="border-b border-[var(--border)]" style={{ background: "var(--darker)" }}>
      <div className="border-b border-[var(--border)] border-b-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 max-w-[90rem] mx-auto">
          <div className="lg:col-span-12 px-6 lg:px-12 pt-0 pb-12 lg:pb-16">
            <div className="prose-content text-sm lg:text-base leading-relaxed max-w-[65ch]" style={{ fontFamily: "var(--font-body)", color: "var(--foreground)" }}>
              <p>
                <strong>
                  Access is not automatic.
                </strong>
                 Each caller needs configured credentials and only receives the permissions assigned to it. The platform checks organization, app, table, record, and action boundaries where those controls apply.
              </p>
              <p style={{ marginTop: "1rem" }}>
                <strong>
                  The deployed documentation is the contract.
                </strong>
                 It is the source of truth for public locations, available operations, request fields, and response shapes. This page describes the product without inventing technical examples.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
