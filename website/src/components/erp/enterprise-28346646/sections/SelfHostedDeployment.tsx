/* #pilihan-tempat — where Entaris can run, told for customers (no hardware/stack jargon). */
type PlacementRow = { target: string; fit: string; scale: string; control: string };

const HEAD_CELLS: readonly string[] = ["Tempat", "Cocok untuk", "Skala", "Kendali data"];

const PLACEMENT_ROWS: readonly PlacementRow[] = [
  {
    target: "Server ringkas di kantor",
    fit: "Toko & UKM, kantor kecil",
    scale: "1–3 pengguna",
    control: "Perangkat fisik di tempat Anda",
  },
  {
    target: "Cloud milik perusahaan",
    fit: "Tim di beberapa lokasi, akses dari mana saja",
    scale: "Tumbuh sesuai kebutuhan",
    control: "Server atas nama perusahaan Anda",
  },
  {
    target: "Server kantor atau pabrik",
    fit: "Pabrik & distribusi dengan jaringan internal",
    scale: "Hingga puluhan pengguna",
    control: "Penuh — di jaringan Anda sendiri",
  },
];

export function SelfHostedDeployment() {
  return (
    <section id="pilihan-tempat" className="role-section enterprise-deployment">
      <header className="role-intro">
        <p className="role-kicker">Pilihan tempat</p>
        <h2>Pilih tempatnya. Entaris-nya tetap sama.</h2>
        <p>
          Dari UKM dengan 1–3 pengguna hingga pabrik dengan puluhan pengguna. Fitur seperti produksi, HPP, dan multi-gudang tinggal diaktifkan saat
          bisnis Anda membutuhkannya.
        </p>
      </header>

      <div className="enterprise-deployment__matrix sh-deploy-matrix" role="table" aria-label="Pilihan tempat menjalankan Entaris">
        <div className="enterprise-deployment__row enterprise-deployment__row--head" role="row">
          {HEAD_CELLS.map((cell) => (
            <span key={cell} role="columnheader">
              {cell}
            </span>
          ))}
        </div>
        {PLACEMENT_ROWS.map((row) => (
          <div key={row.target} className="enterprise-deployment__row" role="row">
            <strong role="rowheader">{row.target}</strong>
            <span role="cell" data-label={HEAD_CELLS[1]}>{row.fit}</span>
            <span role="cell" data-label={HEAD_CELLS[2]}>{row.scale}</span>
            <span role="cell" data-label={HEAD_CELLS[3]}>{row.control}</span>
          </div>
        ))}
      </div>

      <p className="enterprise-deployment__note">
        Kapasitas nyata bergantung pada perangkat, jumlah transaksi, dan modul yang aktif. Kami bantu menakar kebutuhan Anda saat demo.
      </p>
    </section>
  );
}
