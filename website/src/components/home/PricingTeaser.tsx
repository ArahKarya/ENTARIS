import Link from "next/link";
import { SectionEyebrow } from "./SectionEyebrow";

/** #harga-misi: the pricing and mission in two sentences, linking to the full page. */
export function PricingTeaser() {
  return (
    <section id="harga-misi" className="home-pricing" aria-labelledby="harga-misi-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Harga dan Misi" context="Tanpa tarif tetap" />
        <h2 id="harga-misi-heading" className="home-section-title">
          Bayar semampunya, 30% untuk sosial
        </h2>
        <p className="home-section-lead">
          Entaris dibayar tiap bulan sebesar yang menurut Anda pantas, tanpa batas minimum. AIRA gratis bila memakai AI
          Anda sendiri. Sebagian dari yang kami terima disalurkan untuk bantuan sosial dan dilaporkan setiap bulan.
        </p>
        <p className="home-pricing__action">
          <Link href="/harga" className="home-all-modules__link">
            Baca Harga dan Misi
          </Link>
        </p>
      </div>
    </section>
  );
}
