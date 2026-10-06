import { AiraEyebrow } from "./AiraEyebrow";

const FLOW: readonly { step: string; title: string; text: string }[] = [
  { step: "01", title: "Anda bertanya", text: "Dalam bahasa sehari-hari, dari dalam Entaris." },
  { step: "02", title: "AIRA mencari datanya", text: "Hanya data yang boleh dilihat peran Anda." },
  { step: "03", title: "Jawaban atau draf", text: "Ringkasan data, atau draf yang menunggu persetujuan." },
];

/** #cara-kerja — two-column intro with a three-step flow. */
export function AiraProcess() {
  return (
    <section id="cara-kerja" className="tacet-proto-section">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <AiraEyebrow name="Cara kerja" context="Satu sumber data" />
        <div className="tacet-proto-copy">
          <h2>Data yang sama dengan modul lain — bukan salinan.</h2>
          <p>
            AIRA adalah agen AI di dalam Entaris. Ia membaca transaksi yang sama dengan modul Penjualan, Pembelian, Inventori, dan Keuangan,
            sehingga jawabannya selalu konsisten dengan buku besar.
          </p>
          <p>
            Untuk pertanyaan, AIRA mencari data yang tepat di Entaris lalu merangkum hasilnya. Untuk aksi yang mengubah pembukuan, AIRA hanya menyiapkan
            draf — keputusan akhir tetap di tangan manusia.
          </p>
          <ol className="aira-flow">
            {FLOW.map((item) => (
              <li key={item.step}>
                <span className="aira-flow__step">{item.step}</span>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
