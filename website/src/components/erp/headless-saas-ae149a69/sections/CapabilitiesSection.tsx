interface ServiceMapLine {
  name: string;
  owns: string;
}

/** Column the service-map descriptions start at (name + padding), as in the source <pre>. */
const SERVICE_NAME_WIDTH = 18;

const SERVICE_MAP: readonly ServiceMapLine[] = [
  { name: "Gateway", owns: "identity, routing, limits" },
  { name: "App Builder", owns: "apps, schemas, records, workflows, reports, documents, pages" },
  { name: "Permission API", owns: "roles, permissions, assignments, invitations" },
  { name: "Herbert", owns: "organizations, users, service accounts, hosted-app identity" },
  { name: "Agent API", owns: "conversations, knowledge, plans, search, approvals" },
  { name: "Model proxy", owns: "model routing and organization usage accounting" },
  { name: "Renderer", owns: "hosted pages and portals" },
];

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Exact text of the source <pre> (static constants only, escaped): blank first line, then one line per service. */
const SERVICE_MAP_HTML = [
  "\n",
  '<span class="proto-code-comment">Current service map</span>\n',
  ...SERVICE_MAP.map(
    ({ name, owns }) =>
      `<span class="proto-code-command">${escapeHtml(name)}</span>${" ".repeat(SERVICE_NAME_WIDTH - name.length)}${escapeHtml(owns)}\n`,
  ),
].join("");

/** #real-applications — six capability cards + service map. */
export function CapabilitiesSection() {
  return (
    <section id="real-applications" className="border-b border-[var(--border)]" style={{ background: "var(--background)" }}>
      <div className="max-w-[90rem] mx-auto px-6 lg:px-12 pt-16 pb-8">
        <h2 className="font-heading text-2xl lg:text-4xl uppercase" style={{ fontWeight: "900", color: "var(--foreground)", letterSpacing: "-0.02em" }}>
           What the platform supports 
        </h2>
        <p className="text-sm lg:text-base mt-4 max-w-[65ch] leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
           These are product areas present in the ERP.AI codebase today. 
        </p>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="max-w-[90rem] mx-auto grid grid-cols-1 md:grid-cols-2">
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)] md:border-r">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               01 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Data and interfaces 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Create apps with typed tables, records, references, formulas, views, forms, layouts, and collaborative updates. 
            </p>
          </div>
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)]">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               02 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Workflows 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Build workflows, inspect execution state and node output, see errors, stop runs, and retry supported runs. 
            </p>
          </div>
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)] md:border-r">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               03 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Reports and documents 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Create reports, documents, templates, dashboards, and custom pages on the same app model. 
            </p>
          </div>
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)]">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               04 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Identity and access 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Manage organizations, users, roles, permissions, invitations, service accounts, keys, OIDC, and SCIM. 
            </p>
          </div>
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)] md:border-r md:border-b-0">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               05 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Hosted experiences 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
              {" Serve hosted pages, portals, domains, and external apps through the platform's identity and hosting services. "}
            </p>
          </div>
          <div className="px-6 lg:px-12 py-8 border-b border-[var(--border)] border-b-0 md:border-b-0">
            <span className="font-mono text-label uppercase tracking-label block mb-3" style={{ color: "var(--red-on-light)" }}>
               06 
            </span>
            <h3 className="font-heading text-base uppercase mb-3" style={{ fontWeight: "800", color: "var(--foreground)", letterSpacing: "0.02em" }}>
               Change and recovery 
            </h3>
            <p className="text-sm leading-relaxed" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }}>
               Use schema branches, commits and merges, snapshots and restore, audit history, workflow run history, trash recovery, and saved page versions where supported. 
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="max-w-[90rem] mx-auto px-6 lg:px-12 py-8">
          <div className="border border-[var(--border)]" style={{ background: "var(--darker)" }}>
            <div className="px-4 py-2 border-b border-[var(--border)]">
              <span className="font-mono text-label uppercase tracking-label" style={{ color: "var(--text-m)" }}>
                 ERP.AI service ownership 
              </span>
            </div>
            {/* Built as one HTML string: a JSX child array cannot keep the leading blank line (React only
                re-adds the newline the HTML parser strips after <pre> for string / innerHTML content). */}
            <pre className="px-4 py-4 font-mono text-xs leading-relaxed overflow-x-auto" style={{ color: "var(--text-m)" }} aria-label="ERP.AI service ownership code example" tabIndex={0} dangerouslySetInnerHTML={{ __html: SERVICE_MAP_HTML }} />
          </div>
        </div>
      </div>
    </section>
  );
}
