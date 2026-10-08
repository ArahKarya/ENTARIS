import Image from "next/image";
import { AiraEyebrow } from "./AiraEyebrow";

const FLOW: readonly { step: string; title: string; text: string }[] = [
  { step: "01", title: "Anda bertanya atau memberi tugas", text: "Dalam bahasa sehari-hari, dari dalam Entaris." },
  { step: "02", title: "AIRA mengerjakan langkah demi langkah", text: "Mencari data, menganalisis, dan menyusun hasil — hanya dengan data yang boleh dilihat peran Anda." },
  { step: "03", title: "Jawaban atau draf", text: "Ringkasan data, atau draf yang menunggu persetujuan." },
];

/** #cara-kerja — two-column intro with a three-step flow. */
export function AiraProcess() {
  return (
    <section id="cara-kerja" className="tacet-proto-section">
      <div className="tacet-proto-wrap">
        <div className="tacet-proto-two-col">
          <AiraEyebrow name="Cara kerja" context="Satu sumber data" />
          <div className="tacet-proto-copy">
            <h2>Data yang sama dengan modul lain — bukan salinan.</h2>
            <p>
              AIRA adalah gabungan tiga komponen yang sengaja dipisah: <strong>Engine AI</strong> (otak perencana yang bebas dipilih tanpa vendor lock-in), <strong>Server MCP ENTARIS</strong> (tangan dan penjaga yang menegakkan izin serta persetujuan), dan <strong>Panel Web / Chat</strong>.
            </p>
            <p>
              Untuk pertanyaan, AIRA mencari data riil dari buku besar lalu merangkum hasilnya. Untuk tugas, AIRA menyusun draf dokumen — dari faktur, pengajuan pembayaran, hingga draf buku kas dari foto nota. Secara bawaan, aksi finansial berhenti sebagai draf atau antrean persetujuan.
            </p>
            <p>
              Bahkan saat bisnis Anda berkembang dan menambahkan modul custom sendiri, AIRA ikut mempelajari proses baru tersebut lewat katalog tool MCP modular — tanpa perlu melatih AI dari nol.
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

        <div className="aira-mobile-showcase">
          <div className="aira-mobile-showcase__media">
            <Image
              src="/assets/aira-mobile-mockup.jpg"
              alt="Tampilan chat AIRA di smartphone dalam genggaman tangan"
              className="aira-mobile-showcase__img"
              width={1200}
              height={896}
              priority
            />
          </div>
          <div className="aira-mobile-showcase__content">
            <span className="aira-mobile-showcase__badge">Akses Cepat Di Mana Saja</span>
            <h3>AIRA dalam genggaman: kirim foto nota, tanya data, dan putuskan transaksi dari HP.</h3>
            <p>
              Tidak perlu selalu di depan laptop. Buka aplikasi PWA Entaris di ponsel atau hubungkan engine AIRA ke WhatsApp &amp; Telegram yang sudah dipakai tim Anda sehari-hari.
            </p>
            <ul className="aira-mobile-showcase__points">
              <li>
                <strong>Foto Nota jadi Draft Buku Kas:</strong> Kirim foto struk belanja atau bensin via WhatsApp/PWA, AIRA membaca teks nota dan ENTARIS memetakan akun debit/kredit secara deterministik.
              </li>
              <li>
                <strong>Tanya data operasional:</strong> “Berapa piutang lewat 60 hari?” atau “Berapa stok beras premium di Gudang B?” dijawab langsung dari buku besar saat Anda di perjalanan.
              </li>
              <li>
                <strong>Persetujuan satu ketukan:</strong> Notifikasi pengajuan pembayaran atau PO masuk ke ponsel dengan perbandingan nilai sebelum/sesudah dan tombol otorisasi instan.
              </li>
              <li>
                <strong>Identitas aman &amp; diaudit:</strong> Setiap pesan dipetakan ke akun pengguna berizin resmi dengan token HMAC-SHA256 berbatas waktu 120 detik (`via = &apos;mcp&apos;`).
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
