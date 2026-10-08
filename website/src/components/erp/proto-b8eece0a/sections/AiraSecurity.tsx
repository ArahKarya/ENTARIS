import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

type Control = { icon: AiraIconName; title: string; text: string };

const CONTROLS: readonly Control[] = [
  {
    icon: "user-shield",
    title: "Hak akses sama dengan penanya (RBAC)",
    text: "AIRA hanya bisa membuka data dan memanggil tool yang diizinkan untuk peran pengguna yang sedang berbicara (Admin, Accountant, Staf Produksi, Viewer). Di percakapan grup berlaku kewenangan anggota terendah.",
  },
  {
    icon: "signature",
    title: "Pernyataan pelaku bertanda tangan (HMAC)",
    text: "Setiap panggilan diverifikasi dengan token profil engine dan pernyataan pelaku bertanda tangan HMAC-SHA256 (berlaku 120 detik, nonce sekali pakai). Tidak ada akun 'super' bersama.",
  },
  {
    icon: "list-details",
    title: "Arsitektur Otak vs Tangan",
    text: "Engine AI ('otak') boleh diganti, tetapi aturan keamanan, persetujuan, dan jejak audit berada di ENTARIS ('tangan dan penjaga'). Data dan pembukuan tidak pernah terkunci ke satu vendor AI.",
  },
  {
    icon: "circle-check",
    title: "Pembukuan menunggu persetujuan",
    text: "Secara bawaan semua aksi finansial berhenti sebagai draf atau antrean persetujuan manusia. Admin dapat memberi level 'Langsung' khusus untuk pengguna terpercaya tertentu sesuai kebijakan perusahaan.",
  },
];

const STATS: readonly { value: string; label: string }[] = [
  { value: "Ratusan", label: "kemampuan terdaftar (MCP)" },
  { value: "14", label: "area bisnis (toolset)" },
  { value: "100%", label: "kedaulatan server mandiri" },
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
