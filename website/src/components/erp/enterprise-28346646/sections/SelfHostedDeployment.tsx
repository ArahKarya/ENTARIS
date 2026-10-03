/* #opsi-deploy — where Entaris can run. Claims stay within README (no SLAs or certifications). */
type DeploymentRow = { target: string; fit: string; scale: string; control: string; note: string };

const HEAD_CELLS: readonly string[] = ["Tempat", "Cocok untuk", "Skala", "Kendali data", "Catatan"];

const DEPLOYMENT_ROWS: readonly DeploymentRow[] = [
  {
    target: "Raspberry Pi 5",
    fit: "Toko & UKM, kantor kecil",
    scale: "UKM, 1–3 user",
    control: "Perangkat fisik di tempat Anda",
    note: "Hemat daya; backup rutin ke media terpisah",
  },
  {
    target: "VPS",
    fit: "Tim terdistribusi, akses dari mana saja",
    scale: "Bertumbuh sesuai ukuran VPS",
    control: "Server sewaan atas nama Anda",
    note: "Pasang HTTPS/reverse proxy di depan port 3001",
  },
  {
    target: "Server on-premise",
    fit: "Pabrik & distribusi dengan jaringan internal",
    scale: "Hingga puluhan user",
    control: "Penuh — di jaringan Anda sendiri",
    note: "Modul produksi, multi-gudang, dan HPP siap diaktifkan",
  },
];

export function SelfHostedDeployment() {
  return (
    <section id="opsi-deploy" className="role-section enterprise-deployment">
      <header className="role-intro">
        <p className="role-kicker">Opsi deploy</p>
        <h2>Pilih tempatnya. Stack-nya tetap sama.</h2>
        <p>
          Image Docker yang sama berjalan di Raspberry Pi 5, VPS, atau server on-premise. Skala tumbuh dari UKM dengan 1–3 user hingga pabrik dengan puluhan user — schema sama, fitur tinggal diaktifkan.
        </p>
      </header>
      <div className="enterprise-deployment__matrix sh-deploy-matrix" role="table" aria-label="Perbandingan opsi deploy">
        <div className="enterprise-deployment__row enterprise-deployment__row--head" role="row">
          {HEAD_CELLS.map((cell) => (
            <span key={cell} role="columnheader">
              {cell}
            </span>
          ))}
        </div>
        {DEPLOYMENT_ROWS.map((row) => (
          <div key={row.target} className="enterprise-deployment__row" role="row">
            <strong role="rowheader">{row.target}</strong>
            <span role="cell" data-label={HEAD_CELLS[1]}>{row.fit}</span>
            <span role="cell" data-label={HEAD_CELLS[2]}>{row.scale}</span>
            <span role="cell" data-label={HEAD_CELLS[3]}>{row.control}</span>
            <span role="cell" data-label={HEAD_CELLS[4]}>{row.note}</span>
          </div>
        ))}
      </div>
      <p className="enterprise-deployment__note">
        Kapasitas nyata bergantung pada spesifikasi perangkat, jumlah transaksi, dan modul yang aktif. Kami bantu menakar kebutuhan saat demo.
      </p>
    </section>
  );
}
