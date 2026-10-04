import { DEMO_HREF } from "@/components/site/siteConfig";
import Link from "next/link";

/* #operasional — life after go-live, told for customers: copy + CTA beside the record list. */
type RecordEntry = { term: string; detail: string };

const RECORD_ENTRIES: readonly RecordEntry[] = [
  { term: "Cadangan data", detail: "Backup dan pemulihan data langsung dari menu Pengaturan" },
  { term: "Pembaruan", detail: "Versi baru dipasang tanpa kehilangan data yang sudah ada" },
  { term: "Ekspor", detail: "Laporan dan dokumen siap cetak ke PDF, daftar transaksi ke Excel" },
  { term: "Pengembangan", detail: "Modul tambahan bisa dikembangkan sesuai kebutuhan bisnis Anda" },
];

export function SelfHostedOperations() {
  return (
    <section id="operasional" className="role-section role-section--quiet enterprise-operations">
      <div className="enterprise-operations__copy">
        <p className="role-kicker">Setelah berjalan</p>
        <h2>Setelah berjalan, Anda yang pegang kendali.</h2>
        <p>
          Cadangan data, laporan, dan pengembangan fitur tetap dalam kendali perusahaan Anda — tanpa menunggu antrean vendor.
        </p>
        <div className="enterprise-operations__actions">
          <Link href={DEMO_HREF} className="btn btn--primary btn--lg">
            Minta demo
          </Link>
        </div>
      </div>
      <dl className="enterprise-operations__record">
        {RECORD_ENTRIES.map((entry) => (
          <div key={entry.term}>
            <dt>{entry.term}</dt>
            <dd>{entry.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
