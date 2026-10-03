import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

type Control = { icon: AiraIconName; title: string; text: string };

const CONTROLS: readonly Control[] = [
  {
    icon: "user-shield",
    title: "RBAC yang sama dengan UI",
    text: "AIRA hanya bisa memakai tool yang diizinkan untuk peran pengguna yang sedang login — Admin, Accountant, StaffProduksi, atau Viewer.",
  },
  {
    icon: "signature",
    title: "Tanda tangan HMAC-SHA256 per-run",
    text: "Setiap permintaan tulis dari AIRA wajib bertanda tangan per-run dengan stempel waktu, sehingga permintaan palsu atau yang diulang ditolak.",
  },
  {
    icon: "list-details",
    title: "386 tool di 45 modul, terdaftar",
    text: "Setiap tool dideklarasikan lengkap dengan tingkat risiko, peran, dan level otonomi — kemampuan AIRA bisa ditinjau dan diatur dari satu tempat.",
  },
  {
    icon: "circle-check",
    title: "Pembukuan menunggu persetujuan",
    text: "Semua aksi yang mengubah pembukuan masuk alur approval dan baru berefek setelah disetujui manusia. Tidak ada posting otomatis.",
  },
];

const STATS: readonly { value: string; label: string }[] = [
  { value: "386", label: "tool terdaftar" },
  { value: "45", label: "modul" },
  { value: "4", label: "peran bawaan" },
];

/** #keamanan — the controls around AIRA. */
export function AiraSecurity() {
  return (
    <section id="keamanan" className="tacet-proto-section tacet-proto-section--darker">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <AiraEyebrow name="Keamanan" context="Kontrol di sekitar AIRA" />
        <div>
          <div className="tacet-proto-copy">
            <h2>Batas AIRA sama dengan batas pengguna.</h2>
            <p>AIRA tidak punya jalur belakang. Ia tunduk pada hak akses, tanda tangan permintaan, dan alur approval yang sama dengan tim Anda.</p>
          </div>
          <dl className="aira-stats">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
          <ul className="aira-controls">
            {CONTROLS.map((control) => (
              <li key={control.title}>
                <AiraIcon name={control.icon} className="aira-controls__icon" />
                <h3>{control.title}</h3>
                <p>{control.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
