import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

type Control = { icon: AiraIconName; title: string; text: string };

const CONTROLS: readonly Control[] = [
  {
    icon: "user-shield",
    title: "Hak akses sama dengan penanya",
    text: "AIRA hanya bisa membuka data dan menjalankan tugas yang diizinkan untuk peran pengguna yang sedang berbicara (Admin, Accountant, Staf Produksi, Viewer). Di percakapan grup berlaku kewenangan anggota terendah.",
  },
  {
    icon: "signature",
    title: "Setiap permintaan ditandatangani",
    text: "Setiap permintaan AIRA membawa tanda tangan digital atas nama pengguna yang meminta. Izinnya hanya berlaku dua menit dan sekali pakai. Tidak ada akun 'super' bersama.",
  },
  {
    icon: "list-details",
    title: "Otak AI bisa diganti, aturannya tetap",
    text: "Otak AI boleh diganti, tetapi aturan keamanan, persetujuan, dan jejak audit tetap berada di Entaris. Data dan pembukuan tidak terkunci ke satu vendor AI.",
  },
  {
    icon: "circle-check",
    title: "Pembukuan menunggu persetujuan",
    text: "Secara bawaan semua aksi finansial berhenti sebagai draf atau antrean persetujuan manusia. Admin dapat memberi level 'Langsung' khusus untuk pengguna terpercaya tertentu sesuai kebijakan perusahaan.",
  },
];

const STATS: readonly { value: string; label: string }[] = [
  { value: "Ratusan", label: "tugas bisnis terdaftar" },
  { value: "14", label: "area bisnis" },
  { value: "Server Anda", label: "tempat data disimpan" },
];

/** #keamanan: the controls around AIRA. */
export function AiraSecurity() {
  return (
    <section id="keamanan" className="tacet-proto-section tacet-proto-section--darker">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <AiraEyebrow name="Keamanan" context="Kontrol di sekitar AIRA" />
        <div>
          <div className="tacet-proto-copy">
            <h2>Batas AIRA sama dengan batas pengguna.</h2>
            <p>AIRA tidak punya jalur belakang. Ia tunduk pada hak akses, tanda tangan permintaan, dan alur persetujuan yang sama dengan tim Anda.</p>
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
