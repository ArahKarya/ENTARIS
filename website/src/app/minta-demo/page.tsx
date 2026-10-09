import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { PageFrame } from "@/components/pages/PageFrame";
import { PageHero } from "@/components/pages/PageHero";
import { DemoForm } from "@/components/pages/demo/DemoForm";
import "./demo.css";

export const metadata: Metadata = {
  title: "Minta demo: lihat Entaris berjalan di bisnis Anda",
  description: "Isi data singkat, lalu lanjutkan lewat WhatsApp atau email. Kami siapkan demo dengan contoh yang mirip bisnis Anda.",
};

export default function Page() {
  return (
    <SiteShell>
      <PageFrame
        hero={
          <PageHero
            eyebrow={{ name: "Minta demo" }}
            lines={["Lihat Entaris berjalan", "di bisnis Anda."]}
            lead="Isi data singkat di bawah. Tim kami menyiapkan demo dengan contoh yang mirip bisnis Anda, lalu menghubungi Anda lewat email atau WhatsApp, sesuai pilihan Anda."
            compact
          />
        }
      >
        <section id="formulir" className="demo-section" aria-labelledby="formulir-heading">
          <header className="demo-section__head">
            <p className="role-kicker">Data awal</p>
            <h2 id="formulir-heading">Ceritakan sedikit tentang bisnis Anda.</h2>
          </header>
          <DemoForm />
        </section>
      </PageFrame>
    </SiteShell>
  );
}
