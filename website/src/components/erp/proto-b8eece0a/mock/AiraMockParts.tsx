import type { CSSProperties, ReactNode } from "react";
import { AiraIcon } from "../sections/AiraIcon";
import { AiraMark } from "@/components/site/AiraLogo";

/*
 * Building blocks of the illustrative AIRA UI mockups. All figures and names are sample data for
 * a UI demo (every mockup carries a visible "Data contoh" badge); none are customer data.
 */

type RevealProps = {
  /** Story step that reveals this block (story mockups only). */
  reveal?: 1 | 2 | 3;
  /** Position in the hero entrance sequence (hero mockup only). */
  seq?: number;
};

type SeqStyle = CSSProperties & { "--aira-seq"?: number };

/** Inline custom property that staggers a block in the hero entrance sequence. */
export const seqStyle = (seq: number | undefined): SeqStyle | undefined =>
  seq === undefined ? undefined : { "--aira-seq": seq };

function Reveal({ reveal, seq, className, children }: RevealProps & { className: string; children: ReactNode }) {
  return (
    <div className={className} data-reveal={reveal} data-seq={seq} style={seqStyle(seq)}>
      {children}
    </div>
  );
}

export function UserBubble({ children, ...reveal }: RevealProps & { children: ReactNode }) {
  return (
    <Reveal className="aira-msg aira-msg--user" {...reveal}>
      <div className="aira-text">{children}</div>
    </Reveal>
  );
}

type ToolRowProps = RevealProps & { module: string; tool: string };

export function ToolRow({ module, tool, ...reveal }: ToolRowProps) {
  return (
    <Reveal className="aira-tool" {...reveal}>
      <AiraIcon name="tool" className="aira-tool__icon" />
      <span className="aira-tool__label">
        Membaca <strong>{module}</strong>
        <span aria-hidden="true"> › </span>
        {tool}
      </span>
      <span className="aira-tool__status">
        <AiraIcon name="circle-check" />
        selesai
      </span>
    </Reveal>
  );
}

export function AiraAnswer({ children, ...reveal }: RevealProps & { children: ReactNode }) {
  return (
    <Reveal className="aira-msg aira-msg--aira" {...reveal}>
      <span className="aira-msg__avatar" aria-hidden="true">
        <AiraMark size={16} />
      </span>
      <div className="aira-msg__body">{children}</div>
    </Reveal>
  );
}

export type MockRow = readonly [string, string, string];

type MockTableProps = {
  head: MockRow;
  rows: readonly MockRow[];
  foot?: MockRow;
};

export function MockTable({ head, rows, foot }: MockTableProps) {
  return (
    <table className="aira-table">
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, index) => (
              <td key={`${row[0]}-${index}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot ? (
        <tfoot>
          <tr>
            {foot.map((cell, index) => (
              <td key={`foot-${index}`}>{cell}</td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

export function SampleBadge() {
  return <span className="aira-badge">Data contoh</span>;
}

/** Compact AIRA panel used inside the story sections. */
export function AiraPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="aira-panel">
      <div className="aira-panel__head">
        <span className="aira-panel__name">
          <AiraMark size={15} />
          AIRA
        </span>
        <span className="aira-panel__title">{title}</span>
        <SampleBadge />
      </div>
      <div className="aira-panel__body">{children}</div>
    </div>
  );
}

const RECEIVABLE_ROWS: readonly MockRow[] = [
  ["PT Contoh Jaya", "61–90 hari", "Rp 96.400.000"],
  ["CV Sampel Makmur", "> 90 hari", "Rp 52.150.000"],
  ["PT Ilustrasi Abadi", "61–90 hari", "Rp 36.200.000"],
];

/** AIRA's answer to "Berapa piutang yang lewat 60 hari?" (hero + Keuangan story). */
export function ReceivablesAnswer(reveal: RevealProps) {
  return (
    <AiraAnswer {...reveal}>
      <div className="aira-text">
        Piutang yang lewat 60 hari totalnya <strong>Rp 184.750.000</strong> dari 3 pelanggan. Terbesar: PT Contoh Jaya.
      </div>
      <MockTable head={["Pelanggan", "Umur", "Saldo"]} rows={RECEIVABLE_ROWS} foot={["Total", "", "Rp 184.750.000"]} />
      <div className="aira-msg__source">Sumber: buku besar · 1.2.1 Piutang Usaha</div>
    </AiraAnswer>
  );
}
