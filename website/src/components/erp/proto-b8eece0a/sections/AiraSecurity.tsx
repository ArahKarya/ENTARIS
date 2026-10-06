import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

type Control = { icon: AiraIconName; title: string; text: string };

const CONTROLS: readonly Control[] = [
  {
    icon: "user-shield",
    title: "Hak akses sama dengan pengguna",
    text: "AIRA hanya bisa membuka data dan fitur yang diizinkan untuk peran pengguna yang sedang masuk — Admin, Accountant, Staf Produksi, atau Viewer.",
  },
  {
    icon: "signature",
    title: "Setiap permintaan diverifikasi",
    text: "Setiap perubahan yang diminta lewat AIRA diberi tanda pengenal dan waktu, lalu diperiksa sistem — permintaan palsu atau yang dikirim ulang otomatis ditolak.",
  },
  {
    icon: "list-details",
    title: "Kemampuan AIRA bisa diatur",
    text: "Setiap kemampuan AIRA tercatat lengkap dengan tingkat risiko dan peran yang boleh memakainya — admin bisa meninjau dan mengaturnya dari satu tempat.",
  },
  {
    icon: "circle-check",
    title: "Pembukuan menunggu persetujuan",
    text: "Semua aksi yang mengubah pembukuan masuk alur approval dan baru berefek setelah disetujui manusia. Tidak ada posting otomatis.",
  },
];

const STATS: readonly { value: string; label: string }[] = [
  { value: "386", label: "kemampuan terdaftar" },
  { value: "6", label: "area bisnis" },
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
