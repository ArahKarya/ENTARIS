import type { ReactNode } from "react";
import { ArrowRightIcon, ProtoEyebrow } from "./ProtoEyebrow";

type Bulletin = {
  icon: ReactNode;
  label: string;
  title: string;
  text: string;
  href: string;
  cta: string;
};

const ICON_PROPS = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
} as const;

const iconClass = (name: string): string =>
  `icon icon-tabler icons-tabler-outline icon-tabler-${name} tacet-proto-bulletin__icon`;

const BULLETINS: readonly Bulletin[] = [
  {
    icon: (
      <svg {...ICON_PROPS} className={iconClass("receipt")} data-icon="receipt">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2" />
      </svg>
    ),
    label: "Finance",
    title: "Invoice exception tracker.",
    text: "A dashboard for overdue invoices, disputed lines, owners, and approvals.",
    href: "#case-files",
    cta: "See examples",
  },
  {
    icon: (
      <svg {...ICON_PROPS} className={iconClass("checklist")} data-icon="checklist">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M9.615 20h-2.615a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8" />
        <path d="M14 19l2 2l4 -4" />
        <path d="M9 8h4" />
        <path d="M9 12h2" />
      </svg>
    ),
    label: "Ops",
    title: "Month-end close checklist.",
    text: "Tasks, blockers, responsible owners, review steps, and approval history.",
    href: "#approval",
    cta: "See approval",
  },
  {
    icon: (
      <svg {...ICON_PROPS} className={iconClass("chart-line")} data-icon="chart-line">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M4 19l16 0" />
        <path d="M4 15l4 -6l4 2l4 -5l4 4" />
      </svg>
    ),
    label: "Sales",
    title: "Renewal dashboard.",
    text: "Account health, owner tasks, QBR prep, and renewal risk views.",
    href: "#case-files",
    cta: "See examples",
  },
  {
    icon: (
      <svg {...ICON_PROPS} className={iconClass("headset")} data-icon="headset">
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M4 14v-3a8 8 0 1 1 16 0v3" />
        <path d="M18 19c0 1.657 -2.686 3 -6 3" />
        <path d="M4 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3" />
        <path d="M15 14a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2v-3" />
      </svg>
    ),
    label: "Support",
    title: "Ticket triage queue.",
    text: "Priority rules, SLA views, escalation flow, and article drafts.",
    href: "#case-files",
    cta: "See examples",
  },
];

/** m06 — #tools, static example cards (footer seam). */
export function ProtoExamples() {
  return (
    <section id="tools" className="tacet-proto-section tacet-proto-section--framed tacet-footer-seam">
      <div className="tacet-proto-wrap">
        <div className="tacet-proto-section-head">
          <ProtoEyebrow name="Examples" context="Real business workflows" />
          <h2>Start with a process your team already owns.</h2>
        </div>
        <div className="tacet-proto-bulletin-grid">
          {BULLETINS.map((bulletin) => (
            <article key={bulletin.label} className="tacet-proto-bulletin">
              <p className="tacet-proto-bulletin__label">
                {bulletin.icon}
                {bulletin.label}
              </p>
              <h3>{bulletin.title}</h3>
              <span>{bulletin.text}</span>
              <a href={bulletin.href}>
                {bulletin.cta}
                <ArrowRightIcon />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
