import { DEMO_HREF } from "@/components/site/siteConfig";
import { AiraWindow } from "../mock/AiraWindow";
import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon } from "./AiraIcon";
import Link from "next/link";

/** Hero: copy, CTAs and the AIRA chat mockup. */
export function AiraHero() {
  return (
    <header className="erpai-hero tacet-proto-hero aira-hero" aria-labelledby="aira-hero-title">
      <div className="tacet-proto-wrap tacet-proto-hero__grid">
        <div className="tacet-proto-hero__story">
          <AiraEyebrow name="AIRA" context="Agen AI di dalam Entaris" />
          <h1 id="aira-hero-title">
            <span>Agen AI yang bernalar di atas </span>
            <span>buku besar Anda.</span>
          </h1>
        </div>
        <div className="tacet-proto-hero__summary">
          <p className="tacet-proto-hero__lede">
            AIRA bekerja di atas data transaksi yang sama dengan modul lain di Entaris — bukan salinan. Ia menjawab pertanyaan, menganalisis
            laporan, dan menyiapkan draf. Semua angkanya konsisten dengan buku besar, dan setiap perubahan pembukuan tetap menunggu persetujuan
            manusia.
          </p>
          <div className="aira-hero__actions">
            <Link href={DEMO_HREF} className="ent-btn ent-btn--solid aira-hero__btn">
              Minta demo
            </Link>
            <a href="#cara-kerja" className="ent-btn ent-btn--ghost aira-hero__btn">
              Lihat cara kerjanya
              <AiraIcon name="arrow-down" className="aira-hero__btn-icon" />
            </a>
          </div>
        </div>
        <aside className="tacet-proto-console aira-hero__console" aria-label="Contoh tampilan AIRA menjawab pertanyaan piutang di dalam Entaris">
          <AiraWindow />
        </aside>
      </div>
    </header>
  );
}
