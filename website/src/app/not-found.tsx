import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { EntarisMark } from "@/components/site/EntarisLogo";

export const metadata: Metadata = { title: "Halaman tidak ditemukan" };

export default function NotFound() {
  return (
    <SiteShell>
      <main id="main-content" className="ent-404">
        <EntarisMark size={56} />
        <p className="ent-404__code">404</p>
        <h1 className="ent-404__title">Halaman tidak ditemukan.</h1>
        <p className="ent-404__lead">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
        <div className="ent-404__actions">
          <Link className="ent-btn ent-btn--solid" href="/">
            Kembali ke beranda
          </Link>
          <Link className="ent-btn ent-btn--ghost" href="/aira">
            Kenali AIRA
          </Link>
        </div>
      </main>
    </SiteShell>
  );
}
