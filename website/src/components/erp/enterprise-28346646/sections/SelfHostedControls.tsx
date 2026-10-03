/* #kontrol — four control questions along one path, from login to the audit record. */
type ControlRow = { question: string; title: string; body: string; outcome: string };

const CONTROL_ROWS: readonly ControlRow[] = [
  {
    question: "Siapa yang bertindak?",
    title: "Akun & peran pengguna",
    body: "Setiap orang masuk dengan akunnya sendiri. Ada empat peran bawaan — Admin, Accountant, Staf Produksi, Viewer — dan Admin bisa menambah peran sesuai struktur perusahaan.",
    outcome: "Kenali dulu",
  },
  {
    question: "Boleh dilanjutkan?",
    title: "Hak akses & persetujuan",
    body: "Setiap orang hanya bisa membuka dan mengubah modul yang menjadi haknya. Dokumen penting melewati persetujuan — termasuk draf dari AIRA, yang baru berlaku setelah disetujui.",
    outcome: "Tahan bila belum disetujui",
  },
  {
    question: "Apakah pembukuannya benar?",
    title: "Pembukuan otomatis & seimbang",
    body: "Setiap transaksi — invoice, pembayaran, jurnal, produksi, stok — otomatis tercatat di buku besar dengan sistem double-entry, dan selalu seimbang.",
    outcome: "Debit = kredit",
  },
  {
    question: "Apa yang tercatat?",
    title: "Jejak audit",
    body: "Setiap penambahan, perubahan, dan penghapusan data tercatat lengkap: siapa, kapan, serta nilai sebelum dan sesudahnya.",
    outcome: "Simpan jejaknya",
  },
];

export function SelfHostedControls() {
  return (
    <section id="kontrol" className="role-section role-section--quiet enterprise-policy">
      <header className="role-intro role-intro--narrow">
        <h2>Satu jalur kontrol, empat pertanyaan.</h2>
        <p>
          Aturan main yang sama berlaku untuk setiap perubahan — dari siapa yang masuk sampai jejak yang tertinggal di catatan audit.
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
