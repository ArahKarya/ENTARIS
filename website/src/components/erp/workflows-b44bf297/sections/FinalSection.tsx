import Link from "next/link";
import { toCloneHref } from "../../shared/links";
import { SectionEyebrow } from "./MiniFlow";

/** m06 — closing call to action (static). */
export function FinalSection() {
  return (
    <section className="wf-final">
      <div className="wf-shell wf-final__inner">
        <div>
          <SectionEyebrow name="Start with one process" context="Keep the control model" />
          <h2>Build the workflow. Review the change. Release when ready.</h2>
        </div>
        <div className="wf-actions">
          <Link className="btn btn--primary" href={toCloneHref("https://erpai.studio/proto")}>
            Open Proto
          </Link>
          <Link className="btn btn--ghost" href={toCloneHref("/contact")}>
            Talk to ERP.AI
          </Link>
        </div>
      </div>
    </section>
  );
}
