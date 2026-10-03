import { Fragment } from "react";

/*
 * #mulai — how a company starts using Entaris, told for customers (no deployment jargon), in the
 * ported control-map card UI. Step 3 reflects the automatic first-run setup (chart of accounts,
 * fiscal year, admin account) described in the README.
 */
type StartStep = { variant: string; label: string; title: string; body: string };

const START_STEPS: readonly StartStep[] = [
  {
    variant: "identity",
    label: "Langkah 1",
    title: "Pilih tempatnya",
    body: "Server di kantor Anda atau cloud milik perusahaan Anda — keputusannya di tangan Anda.",
  },
  {
    variant: "action",
    label: "Langkah 2",
    title: "Entaris dipasang",
    body: "Aplikasi dan datanya dipasang di server pilihan Anda, bukan di server kami.",
  },
  {
    variant: "gate",
    label: "Langkah 3",
    title: "Siap pakai",
    body: "Bagan akun, tahun fiskal, dan akun admin pertama sudah disiapkan otomatis.",
  },
  {
    variant: "target",
    label: "Langkah 4",
    title: "Tim mulai bekerja",
    body: "Tambahkan pengguna, atur hak aksesnya, lalu mulai mencatat transaksi.",
  },
];

const RESULT_ITEMS: readonly string[] = ["Data di server Anda", "Hak akses per peran", "Laporan siap sejak hari pertama"];

export function SelfHostedArchitecture() {
  return (
    <section id="mulai" className="role-section enterprise-map-section">
      <header className="role-intro">
        <p className="role-kicker">Cara mulai</p>
        <h2>Dari keputusan sampai tim bekerja.</h2>
        <p>Tidak perlu memindahkan data ke layanan pihak ketiga. Entaris berjalan di tempat yang Anda pilih, dan pembukuan bisa dimulai sejak hari pertama.</p>
      </header>

      <figure className="enterprise-map sh-startup" data-observe="reveal-up">
        <figcaption>
          <span>Alur mulai</span>
          <strong>Pilih → pasang → siap pakai → bekerja</strong>
        </figcaption>
        <div className="enterprise-map__canvas">
          {START_STEPS.map((step, index) => (
            <Fragment key={step.variant}>
              {index > 0 ? (
                <span className="enterprise-map__edge" aria-hidden="true">
                  →
                </span>
              ) : null}
              <article className={`enterprise-map__node enterprise-map__node--${step.variant}`}>
                <span>{step.label}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            </Fragment>
          ))}
        </div>
        <div className="enterprise-map__evidence">
          <strong>Hasilnya</strong>
          {RESULT_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </figure>
    </section>
  );
}
