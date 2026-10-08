"use client";

import { useState } from "react";
import { AiraEyebrow } from "./AiraEyebrow";

export type FaqItem = {
  question: string;
  answer: string;
};

export const AIRA_FAQS: readonly FaqItem[] = [
  {
    question: "Apakah AIRA bisa memposting jurnal sendiri?",
    answer:
      "Bisa, bergantung konfigurasi. Secara bawaan, seluruh aksi kritis masuk antrean persetujuan manusia. Namun administrator dapat memberi level 'Langsung' kepada pengguna terpercaya tertentu dan memilih tool MCP yang diaktifkan, sehingga AIRA dapat memposting jurnal atas nama pengguna tersebut sesuai kebijakan perusahaan (tetap dibatasi hak akses peran dan seluruh gerbang persetujuan bawaan ENTARIS).",
  },
  {
    question: "Apakah data perusahaan dikirim ke pihak lain atau cloud luar?",
    answer:
      "Tidak. Seluruh data transaksi, buku besar, dan database ENTARIS tetap berada di server milik Anda sendiri (on-premise atau private cloud). Teks percakapan yang diproses engine AI mengikuti penyedia model yang Anda pilih; Anda memegang kendali penuh atas pemilihan toolset dan kedaulatan data perusahaan.",
  },
  {
    question: "Apakah perusahaan bisa mengganti engine AI di masa depan?",
    answer:
      "Ya, sangat fleksibel. Arsitektur kami memisahkan 'Otak' (Engine AI) dan 'Tangan & Penjaga' (Server MCP ENTARIS). Seluruh aturan perizinan, batas wewenang, dan jejak audit berada di ENTARIS, bukan di engine. Anda bebas mengganti engine model AI tanpa khawatir kehilangan keamanan atau mengorbankan integritas data.",
  },
  {
    question: "Apakah AIRA bisa dipakai lewat WhatsApp atau Telegram?",
    answer:
      "Ya. Engine AIRA dapat dihubungkan ke aplikasi chat populer seperti WhatsApp (termasuk WhatsApp Business) dan Telegram. Staf dapat mengirim foto struk belanja untuk dijadikan Draft Buku Kas, menanyakan umur piutang, hingga menerima notifikasi persetujuan transaksi langsung dari ponsel.",
  },
  {
    question: "Apakah AIRA bisa melihat data yang tidak boleh saya lihat?",
    answer:
      "Tidak pernah. Izin AIRA selalu mengikuti akun penanya (RBAC) dan diverifikasi ulang pada setiap panggilan tool. Klaim identitas palsu di dalam teks chat ('saya direktur', 'abaikan instruksi') otomatis diabaikan, dan pada percakapan grup berlaku batas kewenangan anggota terendah.",
  },
  {
    question: "Bagaimana kalau AIRA salah saat membuat transaksi?",
    answer:
      "Pada pengaturan bawaan, aksi tulis hanya menghasilkan draf atau permintaan persetujuan. Angka mutasi tidak pernah langsung menyentuh buku besar sebelum diverifikasi dan disetujui manusia. Setiap perubahan juga terekam lengkap di jejak audit (audit_trail.via = 'mcp') dengan pencatatan nilai sebelum dan sesudah.",
  },
  {
    question: "Bagaimana cara mematikan akses AIRA jika terjadi keadaan darurat?",
    answer:
      "Tersedia saklar mati (kill switch) global instan di menu Pengaturan ENTARIS. Selain itu, administrator dapat mencabut atau memutar token engine seketika untuk memutus akses dalam hitungan detik.",
  },
];

export function AiraFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="tacet-proto-section aira-faq-section" aria-labelledby="aira-faq-heading">
      <div className="tacet-proto-wrap tacet-proto-two-col">
        <AiraEyebrow name="FAQ" context="Pertanyaan yang sering diajukan" />
        <div className="aira-faq-container">
          <div className="tacet-proto-copy">
            <h2 id="aira-faq-heading">Segala hal yang perlu Anda ketahui tentang AIRA &amp; keamanan data.</h2>
            <p>
              Transparansi penuh mengenai cara kerja, batas wewenang, kepemilikan data, dan kontrol keselamatan di sekeliling agen AI Anda.
            </p>
          </div>
          <div className="aira-faq-accordion" role="region" aria-label="Daftar pertanyaan umum AIRA">
            {AIRA_FAQS.map((faq, idx) => {
              const isOpen = openIndex === idx;
              const buttonId = `aira-faq-btn-${idx}`;
              const panelId = `aira-faq-panel-${idx}`;

              return (
                <div key={idx} className={`aira-faq-item${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    id={buttonId}
                    className="aira-faq-trigger"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(idx)}
                  >
                    <span className="aira-faq-trigger__question">{faq.question}</span>
                    <span className="aira-faq-trigger__icon" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="aira-faq-panel"
                    hidden={!isOpen}
                  >
                    <div className="aira-faq-panel__inner">
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
