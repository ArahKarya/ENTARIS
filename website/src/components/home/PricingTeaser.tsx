import Link from "next/link";
import { GithubCard } from "./GithubCard";
import { SectionEyebrow } from "./SectionEyebrow";

/** #harga-misi: the pricing and mission in two sentences, linking to the full page. */
export function PricingTeaser() {
  return (
    <section id="harga-misi" className="home-pricing" aria-labelledby="harga-misi-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Misi dan Dukungan" context="Perangkat lunak terbuka" />
        <h2 id="harga-misi-heading" className="home-section-title">
          Terbuka untuk semua, gratis dipakai
        </h2>
        <p className="home-section-lead">
          Entaris berlisensi AGPL-3.0 untuk kemajuan UMKM, bangsa, dan negara. Tidak ada biaya lisensi; dukungan Anda bersifat sukarela. AIRA gratis bila memakai AI Anda sendiri.
        </p>
        <p className="home-pricing__action">
          <Link href="/harga" className="home-all-modules__link">
            Baca Misi dan Dukungan
          </Link>
        </p>
      </div>
      <GithubCard className="home-pricing__github" />
    </section>
  );
}
