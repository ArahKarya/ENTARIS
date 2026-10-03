import { createPortal } from "react-dom";

/** Tabler outline icons as icons.js renders the dialog's `<i data-icon>` placeholders. */
const ICON_PATHS = {
  plus: ["M12 5l0 14", "M5 12l14 0"],
  "chevron-left": ["M15 6l-6 6l6 6"],
  "chevron-right": ["M9 6l6 6l-6 6"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
} as const;

function TablerIcon({ name }: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`icon icon-tabler icons-tabler-outline icon-tabler-${name}`} data-icon={name} aria-hidden="true" focusable="false">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

type Props = {
  /** `.erp-root` — the source appends the dialog to <body>; the scoped CSS needs it inside the root. */
  host: HTMLElement;
  ref: React.Ref<HTMLDivElement>;
};

/**
 * proto-diagram-zoom.js ensureModal() markup. Rendered once on the first "open" (as the source
 * creates it lazily) and then driven imperatively by useDiagramModal: `hidden`, aria-hidden,
 * the cloned canvas, the transform and the zoom status are all written by the hook, so React
 * never re-renders these attributes.
 */
export function ProtoDiagramModal({ host, ref }: Props) {
  return createPortal(
    <div ref={ref} className="proto-diagram-modal" data-proto-diagram-modal="" hidden aria-hidden="true">
      <div className="proto-diagram-modal__backdrop" data-diagram-action="close" />
      <section className="proto-diagram-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="proto-diagram-modal-title">
        <header className="proto-diagram-modal__header">
          <h2 id="proto-diagram-modal-title" className="proto-diagram-modal__title" />
          <div className="proto-diagram-modal__controls" aria-label="Diagram viewer controls">
            <button type="button" data-diagram-action="zoom-out" aria-label="Zoom out">
              <span aria-hidden="true">-</span>
            </button>
            <span className="proto-diagram-modal__status" data-proto-diagram-status="">
              100%
            </span>
            <button type="button" data-diagram-action="zoom-in" aria-label="Zoom in">
              <TablerIcon name="plus" />
            </button>
            <button type="button" data-diagram-action="reset" aria-label="Reset zoom">
              Reset
            </button>
            <button type="button" data-diagram-action="pan-left" aria-label="Pan left">
              <TablerIcon name="chevron-left" />
            </button>
            <button type="button" data-diagram-action="pan-right" aria-label="Pan right">
              <TablerIcon name="chevron-right" />
            </button>
            <button type="button" data-diagram-action="close" aria-label="Close diagram viewer">
              <TablerIcon name="x" />
            </button>
          </div>
        </header>
        <div className="proto-diagram-modal__viewport" data-proto-diagram-modal-viewport="">
          <div className="proto-diagram-modal__canvas" data-proto-diagram-modal-canvas="" />
        </div>
      </section>
    </div>,
    host,
  );
}
