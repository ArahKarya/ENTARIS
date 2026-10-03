/* #kontrol — four control questions along one path, from login to the audit record. */
type ControlRow = { question: string; title: string; body: string; outcome: string };

const CONTROL_ROWS: readonly ControlRow[] = [
  {
    question: "Siapa yang bertindak?",
    title: "Login & sesi",
    body: "Login JWT di cookie httpOnly plus token CSRF. Empat peran bawaan — Admin, Accountant, StaffProduksi, Viewer — dan Admin bisa menambah peran sendiri.",
    outcome: "Kenali dulu",
  },
  {
    question: "Boleh dilanjutkan?",
    title: "Hak akses & approval",
    body: "RBAC per modul ditegakkan di server. Dokumen penting melewati alur approval — termasuk draf yang disiapkan AIRA, yang baru berefek setelah disetujui manusia.",
    outcome: "Tahan bila belum disetujui",
  },
  {
    question: "Apakah pembukuannya benar?",
    title: "Double-entry otomatis",
    body: "Setiap transaksi — invoice, pembayaran, jurnal, produksi, stok — otomatis posting ke buku besar dan selalu balanced.",
    outcome: "Debit = kredit",
  },
  {
    question: "Apa yang tercatat?",
    title: "Audit trail",
    body: "Setiap insert, update, dan delete tercatat dengan user, waktu, serta nilai sebelum dan sesudah — bisa difilter per user, tabel, atau periode.",
    outcome: "Simpan jejaknya",
  },
];

export function SelfHostedControls() {
  return (
    <section id="kontrol" className="role-section role-section--quiet enterprise-policy">
      <header className="role-intro role-intro--narrow">
        <h2>Satu jalur kontrol, empat pertanyaan.</h2>
        <p>
          Data ada di server Anda, dan aturan main yang sama berlaku untuk setiap perubahan — dari siapa yang login sampai jejak yang tertinggal di audit trail.
        </p>
      </header>
      <div className="enterprise-policy__rows">
        {CONTROL_ROWS.map((row) => (
          <article key={row.title}>
            <span>{row.question}</span>
            <h3>{row.title}</h3>
            <p>{row.body}</p>
            <strong>{row.outcome}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
