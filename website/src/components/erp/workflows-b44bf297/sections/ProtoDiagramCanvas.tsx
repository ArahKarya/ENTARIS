/*
 * Canvas content of the "How Proto Works" diagram (#architecture), converted from the rendered
 * source DOM in its pre-script state: no `observed` classes and no --stagger-index variables
 * (useErpObserver adds both). proto-diagram-zoom.js clones this markup into the zoom dialog.
 */
export function ProtoDiagramCanvas() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-0 max-w-5xl mx-auto items-stretch" data-observe="stagger">
        <div className="flex items-center gap-0 max-lg:flex-col" data-observe="reveal">
          <div className="flex flex-stack flex-1">
            <div className="border-2 border-[var(--foreground)] p-4" style={{ background: "var(--background)" }}>
              <span className="font-mono text-[8px] tracking-label uppercase block mb-1" style={{ color: "var(--gold-on-light)" }}>
                 Input 
              </span>
              <span className="font-heading text-sm uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Mission 
              </span>
              <span className="font-mono text-[9px] block mt-1 leading-snug" style={{ color: "var(--text-m)" }}>
                 Natural-language goal 
                <br />
                 KPIs & success criteria 
              </span>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-4" style={{ background: "var(--background)" }}>
              <span className="font-mono text-[8px] tracking-label uppercase block mb-1" style={{ color: "var(--gold-on-light)" }}>
                 Constraints 
              </span>
              <span className="font-heading text-sm uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 RBAC + Policy 
              </span>
              <span className="font-mono text-[9px] block mt-1 leading-snug" style={{ color: "var(--text-m)" }}>
                 Token budget ceiling 
                <br />
                 Approval gates 
                <br />
                 Scope restrictions 
              </span>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-4" style={{ background: "var(--background)" }}>
              <span className="font-mono text-[8px] tracking-label uppercase block mb-1" style={{ color: "var(--gold-on-light)" }}>
                 Context 
              </span>
              <span className="font-heading text-sm uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Topology Hints 
              </span>
              <span className="font-mono text-[9px] block mt-1 leading-snug" style={{ color: "var(--text-m)" }}>
                 Preferred APIs 
                <br />
                 Retry strategies 
                <br />
                 Fallback chains 
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 my-3 px-2 lg:flex-row lg:gap-0 lg:my-0" aria-hidden="true">
            <div className="font-mono text-[9px] tracking-wide lg:mr-1" style={{ color: "var(--text-m)" }}>
               Deploy 
            </div>
            <div className="w-[2px] h-6 lg:w-8 lg:h-[2px]" style={{ background: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
            <div className="w-0 h-0 lg:hidden" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
            <div className="hidden lg:block w-0 h-0" style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
          </div>
        </div>
        <div className="border-[3px] overflow-hidden" style={{ background: "var(--card)", borderColor: "color-mix(in oklch, var(--ylw), var(--beige-200) 30%)" }} data-observe="reveal">
          <div className="px-5 py-4 text-center border-b" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 85%)" }}>
            <span className="inline-block mb-1" style={{ fontSize: "20px" }}>
              ⚙
            </span>
            <span className="font-heading text-base uppercase block" style={{ fontWeight: "900", color: "var(--foreground)" }}>
               Proto Engine 
            </span>
            <span className="font-mono text-[9px] block mt-1" style={{ color: "var(--org-on-light)" }}>
               Autonomous Runtime · V1 
            </span>
          </div>
          <div className="grid grid-cols-4 border-b" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 85%)" }}>
            <div className="p-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)" }}>
              <span className="font-mono text-[8px] block" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 65%)" }}>
                 01 
              </span>
              <span className="font-heading text-xs uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Observe 
              </span>
              <span className="font-mono text-[7px] block mt-0.5 leading-snug" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }}>
                 Read API state, ingest events 
              </span>
            </div>
            <div className="p-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)" }}>
              <span className="font-mono text-[8px] block" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 65%)" }}>
                 02 
              </span>
              <span className="font-heading text-xs uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Reason 
              </span>
              <span className="font-mono text-[7px] block mt-0.5 leading-snug" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }}>
                 Plan next action, evaluate options 
              </span>
            </div>
            <div className="p-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)" }}>
              <span className="font-mono text-[8px] block" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 65%)" }}>
                 03 
              </span>
              <span className="font-heading text-xs uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Act 
              </span>
              <span className="font-mono text-[7px] block mt-0.5 leading-snug" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }}>
                 Call APIs in sandbox first 
              </span>
            </div>
            <div className="p-3 text-center" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)" }}>
              <span className="font-mono text-[8px] block" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 65%)" }}>
                 04 
              </span>
              <span className="font-heading text-xs uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Iterate 
              </span>
              <span className="font-mono text-[7px] block mt-0.5 leading-snug" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }}>
                 Verify result, loop or halt 
              </span>
            </div>
          </div>
          <div className="py-1.5 text-center border-b" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 85%)", background: "color-mix(in oklch, var(--ylw), transparent 88%)" }}>
            <span className="font-mono text-[8px] tracking-wide inline-flex items-center justify-center gap-1 flex-wrap" style={{ color: "color-mix(in oklch, var(--ylw), var(--ink-deep) 35%)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
               Continuous loop until mission complete or budget exhausted 
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "10px", height: "10px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
            </span>
          </div>
          <div className="grid grid-cols-3">
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 GNN Topology Planner 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Message-passing GNN constructs agent DAG. Node features encode task complexity, edge weights encode data dependencies. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--org-on-light)", color: "var(--org-on-light)" }}>
                 GNN Core 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 GNN Node Encoder 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Encodes mission text into d=128 node embeddings. GraphSAGE aggregation over API dependency graph. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--org-on-light)", color: "var(--org-on-light)" }}>
                 GNN Core 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 GNN Edge Predictor 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Predicts agent-to-agent data flow edges. Attention-weighted message passing, 3 rounds. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--org-on-light)", color: "var(--org-on-light)" }}>
                 GNN Core 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 GNN Memory Graph 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Persistent knowledge graph with learned node embeddings. Cross-run GNN inference for pattern recall. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--pur-on-light)", color: "var(--pur-on-light)" }}>
                 GNN Data 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Tool Registry 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 720+ API bindings. GNN-indexed endpoint discovery via semantic graph search. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--org-on-light)", color: "var(--org-on-light)" }}>
                 Core 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 GNN Anomaly Detector 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Real-time graph attention over execution trace. Detects drift, loops, and cost anomalies. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--red-on-light)", color: "var(--red-on-light)" }}>
                 GNN Safety 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Sandbox 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Dry-run API calls. GNN predicts side-effect propagation before live execution. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--red-on-light)", color: "var(--red-on-light)" }}>
                 Safety 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Guard Rails 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Token budget enforcement. GNN-scored risk gates for human-in-the-loop approval. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--red-on-light)", color: "var(--red-on-light)" }}>
                 Safety 
              </span>
            </div>
            <div className="p-3 border-b border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
              <span className="font-heading text-[9px] uppercase block mb-1" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                 Trace Emitter 
              </span>
              <span className="font-mono text-[7px] leading-snug block mb-1.5" style={{ color: "color-mix(in oklch, var(--ink-deep), transparent 50%)" }}>
                 Structured logs with GNN attention weights per step. Full graph replay capability. 
              </span>
              <span className="font-mono text-[7px] uppercase px-1.5 py-0.5 inline-block" style={{ border: "1px solid var(--pur-on-light)", color: "var(--pur-on-light)" }}>
                 Data 
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0 max-lg:flex-col" data-observe="reveal">
          <div className="flex flex-col items-center gap-1.5 my-3 px-2 lg:flex-row lg:gap-0 lg:my-0" aria-hidden="true">
            <div className="font-mono text-[9px] tracking-wide lg:mr-1" style={{ color: "var(--text-m)" }}>
               Execute 
            </div>
            <div className="w-[2px] h-6 lg:w-8 lg:h-[2px]" style={{ background: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
            <div className="w-0 h-0 lg:hidden" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
            <div className="hidden lg:block w-0 h-0" style={{ borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
          </div>
          <div className="flex flex-stack flex-1">
            <div className="border-2 border-[var(--foreground)] p-3 flex items-center gap-3" style={{ background: "var(--background)" }}>
              <span className="font-heading text-lg" style={{ fontWeight: "900", color: "var(--org-on-light)", letterSpacing: "-1px", minWidth: "36px" }}>
                 280 
              </span>
              <div>
                <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                   Finance & Accounting 
                </span>
                <span className="font-mono text-[8px] block" style={{ color: "var(--text-m)" }}>
                   GL, AP, AR, Tax · 0.8x 
                </span>
              </div>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-3 flex items-center gap-3" style={{ background: "var(--background)" }}>
              <span className="font-heading text-lg" style={{ fontWeight: "900", color: "var(--org-on-light)", letterSpacing: "-1px", minWidth: "36px" }}>
                 195 
              </span>
              <div>
                <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                   CRM & Sales 
                </span>
                <span className="font-mono text-[8px] block" style={{ color: "var(--text-m)" }}>
                   Contacts, Deals, Pipeline · 1.0x 
                </span>
              </div>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-3 flex items-center gap-3" style={{ background: "var(--background)" }}>
              <span className="font-heading text-lg" style={{ fontWeight: "900", color: "var(--org-on-light)", letterSpacing: "-1px", minWidth: "36px" }}>
                 140 
              </span>
              <div>
                <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                   Inventory & MRP 
                </span>
                <span className="font-mono text-[8px] block" style={{ color: "var(--text-m)" }}>
                   Stock, BOM, Fulfilment · 1.2x 
                </span>
              </div>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-3 flex items-center gap-3" style={{ background: "var(--background)" }}>
              <span className="font-heading text-lg" style={{ fontWeight: "900", color: "var(--org-on-light)", letterSpacing: "-1px", minWidth: "36px" }}>
                 65 
              </span>
              <div>
                <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                   HR & Payroll 
                </span>
                <span className="font-mono text-[8px] block" style={{ color: "var(--text-m)" }}>
                   Employees, Leave, Pay · 1.5x 
                </span>
              </div>
            </div>
            <div className="border-2 border-t-0 border-[var(--foreground)] p-3 flex items-center gap-3" style={{ background: "var(--background)" }}>
              <span className="font-heading text-lg" style={{ fontWeight: "900", color: "var(--org-on-light)", letterSpacing: "-1px", minWidth: "36px" }}>
                 40 
              </span>
              <div>
                <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
                   Compliance 
                </span>
                <span className="font-mono text-[8px] block" style={{ color: "var(--text-m)" }}>
                   Audit, GDPR, SOC2 · 2.0x 
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-center max-w-5xl mx-auto" style={{ gap: "80px", marginTop: "8px" }} aria-hidden="true">
        <div className="flex flex-col items-center" style={{ gap: "0" }}>
          <div className="w-0.5" style={{ height: "22px", background: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
          <div className="w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
        </div>
        <div className="flex flex-col items-center" style={{ gap: "0" }}>
          <div className="w-0.5" style={{ height: "22px", background: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
          <div className="w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
        </div>
        <div className="flex flex-col items-center" style={{ gap: "0" }}>
          <div className="w-0.5" style={{ height: "22px", background: "color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
          <div className="w-0 h-0" style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid color-mix(in oklch, var(--ink-deep), transparent 60%)" }} />
        </div>
      </div>
      <div className="max-w-5xl mx-auto mb-6 border-2 overflow-hidden" style={{ borderColor: "var(--foreground)" }}>
        <div className="px-5 py-3 flex items-center gap-3 border-b" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 85%)" }}>
          <span className="font-mono text-label uppercase tracking-label" style={{ color: "var(--foreground)", fontWeight: "700" }}>
             Observability Layer 
          </span>
          <div className="flex-1 h-px" style={{ background: "color-mix(in oklch, var(--ink-deep), transparent 85%)" }} />
          <span className="font-mono text-[9px] uppercase tracking-label" style={{ color: "color-mix(in oklch, var(--ylw), var(--ink-deep) 35%)" }}>
             6 channels · live 
          </span>
        </div>
        <div className="grid grid-cols-6 max-sm:grid-cols-3">
          <div className="px-3 py-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--org)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Dashboard 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               Live mission status 
            </span>
          </div>
          <div className="px-3 py-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--foreground)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Trace DB 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               Full step replay 
            </span>
          </div>
          <div className="px-3 py-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--ylw)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Alerts 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               Budget & failure hooks 
            </span>
          </div>
          <div className="px-3 py-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--grn)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Approvals 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               Human-in-the-loop 
            </span>
          </div>
          <div className="px-3 py-3 text-center border-r" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--pur)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Cost Ledger 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               Per-step token costs 
            </span>
          </div>
          <div className="px-3 py-3 text-center" style={{ borderColor: "color-mix(in oklch, var(--ink-deep), transparent 90%)", background: "var(--card)" }}>
            <div className="flex justify-center mb-1.5">
              <span className="w-2 h-2" style={{ background: "var(--red)", borderRadius: "var(--radius-full)" }} />
            </div>
            <span className="font-heading text-label uppercase block" style={{ fontWeight: "800", color: "var(--foreground)" }}>
               Webhooks 
            </span>
            <span className="font-mono text-[8px] block mt-0.5" style={{ color: "var(--text-m)" }}>
               External integrations 
            </span>
          </div>
        </div>
      </div>
      <div className="flex justify-center mt-2 mb-8 max-w-5xl mx-auto" aria-hidden="true">
        <span className="font-mono text-[9px] tracking-wide inline-flex items-center gap-1.5" style={{ color: "var(--text-m)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "11px", height: "11px", transform: "rotate(180deg)" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M5 12l14 0" />
            <path d="M13 18l6 -6" />
            <path d="M13 6l6 6" />
          </svg>
           iterate with updated state 
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icons-tabler-outline icon-tabler-arrow-right" style={{ width: "11px", height: "11px" }} data-icon="arrow-right" aria-hidden="true" focusable="false">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M5 12l14 0" />
            <path d="M13 18l6 -6" />
            <path d="M13 6l6 6" />
          </svg>
        </span>
      </div>
      <div className="flex items-center gap-6 max-w-5xl mx-auto font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--text-m)" }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: "var(--org)", borderRadius: "var(--radius-full)" }} />
           Control flow 
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: "var(--pur)", borderRadius: "var(--radius-full)" }} />
           Data flow 
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: "var(--red)", borderRadius: "var(--radius-full)" }} />
           Safety boundary 
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: "var(--grn)", borderRadius: "var(--radius-full)" }} />
           Feedback loop 
        </span>
      </div>
    </>
  );
}
