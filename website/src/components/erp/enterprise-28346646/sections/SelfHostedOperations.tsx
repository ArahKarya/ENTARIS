import { DEMO_HREF } from "@/components/site/siteConfig";

/* #operasional — day-two operations: copy + CTA beside the operations record list. */
type RecordEntry = { term: string; detail: string };

const RECORD_ENTRIES: readonly RecordEntry[] = [
  { term: "Backup", detail: "Skrip backup & restore tersedia di repo, plus backup dan restore lewat menu Pengaturan" },
  { term: "Pembaruan", detail: "Backup, pindah ke tag rilis, build ulang — migrasi berjalan otomatis dan data di volume pgdata tetap utuh" },
  { term: "Ekspor", detail: "Laporan dan dokumen siap cetak ke PDF, daftar transaksi ke Excel" },
  { term: "Kustomisasi", detail: "TypeScript end-to-end dan Prisma schema terbuka untuk modul tambahan" },
];

export function SelfHostedOperations() {
  return (
    <section id="operasional" className="role-section role-section--quiet enterprise-operations">
      <div className="enterprise-operations__copy">
        <p className="role-kicker">Operasional</p>
        <h2>Setelah terpasang, tim Anda yang pegang kendali.</h2>
        <p>
          Backup, pembaruan, ekspor data, dan pengembangan modul dilakukan di infrastruktur Anda sendiri — tanpa menunggu antrean vendor.
        </p>
        <div className="enterprise-operations__actions">
          <a href={DEMO_HREF} className="btn btn--primary btn--lg">
            Minta demo
          </a>
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
