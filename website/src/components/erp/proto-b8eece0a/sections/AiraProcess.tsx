import Image from "next/image";
import { AiraEyebrow } from "./AiraEyebrow";

const FLOW: readonly { step: string; title: string; text: string }[] = [
  { step: "01", title: "Anda bertanya atau memberi tugas", text: "Dalam bahasa sehari-hari, dari dalam Entaris." },
  { step: "02", title: "AIRA mengerjakan langkah demi langkah", text: "Mencari data, menganalisis, dan menyusun hasil, hanya dengan data yang boleh dilihat peran Anda." },
  { step: "03", title: "Jawaban atau draf", text: "Ringkasan data, atau draf yang menunggu persetujuan." },
];

/** #cara-kerja: two-column intro with a three-step flow. */
export function AiraProcess() {
  return (
    <section id="cara-kerja" className="tacet-proto-section">
      <div className="tacet-proto-wrap">
        <div className="tacet-proto-two-col">
          <AiraEyebrow name="Cara kerja" context="Satu sumber data" />
          <div className="tacet-proto-copy">
            <h2>AIRA membaca data yang sama dengan modul lain.</h2>
            <p>
              AIRA dibagi menjadi dua bagian yang sengaja dipisah. <strong>Otak AI</strong> merencanakan pekerjaan dan bisa diganti kapan saja. <strong>Entaris</strong> memegang izin, persetujuan, dan jejak audit, jadi aturan bisnis Anda tidak ikut berpindah saat otaknya diganti.
            </p>
            <p>
              Untuk pertanyaan, AIRA mencari data riil dari buku besar lalu merangkum hasilnya. Untuk tugas, AIRA menyusun draf dokumen: faktur, pengajuan pembayaran, atau draf buku kas dari foto nota. Secara bawaan, aksi finansial berhenti sebagai draf atau antrean persetujuan.
            </p>
            <p>
              Saat bisnis Anda menambahkan modul custom sendiri, modul itu otomatis masuk ke katalog tugas AIRA, tanpa melatih AI dari nol.
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
              alt="Ilustrasi chat AIRA di ponsel. Nama dan angka di layar hanya contoh."
              className="aira-mobile-showcase__img"
              width={1200}
              height={896}
              priority
            />
            <span className="aira-mobile-showcase__note">Ilustrasi. Nama dan angka hanya contoh.</span>
          </div>
          <div className="aira-mobile-showcase__content">
            <p className="aira-mobile-showcase__badge">Di ponsel</p>
            <h3>Kirim foto nota, tanya data, dan putuskan transaksi dari HP.</h3>
            <p>
              Tidak perlu selalu di depan laptop. Pasang Entaris sebagai aplikasi di ponsel, atau pakai AIRA lewat WhatsApp dan Telegram yang sudah dipakai tim Anda.
            </p>
            <ul className="aira-mobile-showcase__points">
              <li>
                <strong>Foto nota jadi draf buku kas:</strong> kirim foto struk belanja atau bensin lewat WhatsApp atau aplikasi, AIRA membaca isinya, lalu Entaris menentukan akun debit dan kredit dengan aturan tetap.
              </li>
              <li>
                <strong>Tanya data operasional:</strong> “Berapa piutang lewat 60 hari?” atau “Berapa stok beras premium di Gudang B?” dijawab langsung dari buku besar saat Anda di perjalanan.
              </li>
              <li>
                <strong>Persetujuan satu ketukan:</strong> notifikasi pengajuan pembayaran atau PO masuk ke ponsel dengan perbandingan nilai sebelum/sesudah dan tombol otorisasi instan.
              </li>
              <li>
                <strong>Tercatat atas nama Anda:</strong> setiap pesan terhubung ke akun pengguna yang berizin, dengan izin singkat yang hanya berlaku sekali, dan masuk ke jejak audit.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
