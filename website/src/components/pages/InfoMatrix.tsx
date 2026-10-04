import type { ReactNode } from "react";

/* A section with a heading and a comparison table (ported "deployment matrix" markup). */
type InfoMatrixProps = {
  id: string;
  kicker?: string;
  title: string;
  lead?: ReactNode;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  /** CSS grid-template-columns for desktop; the table stacks into labelled cells on phones. */
  columns: string;
  ariaLabel: string;
  note?: ReactNode;
  quiet?: boolean;
};

export function InfoMatrix({ id, kicker, title, lead, head, rows, columns, ariaLabel, note, quiet = false }: InfoMatrixProps) {
  return (
    <section id={id} className={`role-section${quiet ? " role-section--quiet" : ""} enterprise-deployment`}>
      <header className="role-intro">
        {kicker ? <p className="role-kicker">{kicker}</p> : null}
        <h2>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </header>
      <div className="enterprise-deployment__matrix pg-matrix" role="table" aria-label={ariaLabel} style={{ "--pg-cols": columns } as React.CSSProperties}>
        <div className="enterprise-deployment__row enterprise-deployment__row--head" role="row">
          {head.map((cell) => (
            <span key={cell} role="columnheader">
              {cell}
            </span>
          ))}
        </div>
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="enterprise-deployment__row" role="row">
            <strong role="rowheader">{row[0]}</strong>
            {row.slice(1).map((cell, cellIndex) => (
              <span key={cellIndex} role="cell" data-label={head[cellIndex + 1]}>
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
      {note ? <p className="enterprise-deployment__note">{note}</p> : null}
    </section>
  );
}
