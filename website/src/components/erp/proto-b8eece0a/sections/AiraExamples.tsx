import { AiraEyebrow } from "./AiraEyebrow";
import { AiraIcon, type AiraIconName } from "./AiraIcon";

type Example = {
  icon: AiraIconName;
  label: string;
  question: string;
  text: string;
  href: string;
  cta: string;
};

const EXAMPLES: readonly Example[] = [
  {
    icon: "report-money",
    label: "Keuangan",
    question: "“Berapa piutang yang lewat 60 hari?”",
    text: "Ringkasan per pelanggan dari umur piutang, konsisten dengan buku besar.",
    href: "#bertanya",
    cta: "Lihat contoh",
  },
  {
    icon: "box",
    label: "Inventori",
    question: "“Stok mana yang di bawah minimum?”",
    text: "Daftar barang dengan stok saat ini dan batas minimumnya.",
    href: "#stok",
    cta: "Lihat contoh",
  },
  {
    icon: "shopping-cart",
    label: "Penjualan",
    question: "“Siapkan draf invoice untuk pesanan ini.”",
    text: "AIRA menyusun draf; posting baru terjadi setelah disetujui.",
    href: "#approval",
    cta: "Lihat alurnya",
  },
  {
    icon: "truck",
    label: "Pembelian",
    question: "“Hutang pemasok mana yang jatuh tempo minggu ini?”",
    text: "Dibaca dari umur dan jadwal hutang jatuh tempo, untuk perencanaan kas keluar.",
    href: "#keamanan",
    cta: "Lihat kontrolnya",
  },
];

/** #contoh: four example questions (footer seam). */
export function AiraExamples() {
  return (
    <section id="contoh" className="tacet-proto-section tacet-proto-section--framed tacet-footer-seam">
      <div className="tacet-proto-wrap">
        <div className="tacet-proto-section-head">
          <AiraEyebrow name="Contoh" context="Pertanyaan sehari-hari" />
          <h2>Mulai dari pertanyaan yang sudah sering Anda ajukan.</h2>
        </div>
        <div className="tacet-proto-bulletin-grid">
          {EXAMPLES.map((example) => (
            <article key={example.label} className="tacet-proto-bulletin">
              <p className="tacet-proto-bulletin__label">
                <AiraIcon name={example.icon} className="tacet-proto-bulletin__icon" />
                {example.label}
              </p>
              <h3>{example.question}</h3>
              <span>{example.text}</span>
              <a href={example.href}>
                {example.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
