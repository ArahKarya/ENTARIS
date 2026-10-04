import Link from "next/link";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, TablerIcon } from "./TablerIcon";

/* #cta — closing card: contact CTAs beside a short list of what the customer gets. */
const BENEFITS: readonly string[] = [
  "Aplikasi & data di server perusahaan Anda",
  "Empat peran bawaan, plus peran sesuai struktur Anda",
  "Persetujuan dokumen & jejak audit lengkap",
  "AIRA, agen AI untuk tanya data & analisis laporan",
];

export function SelfHostedCta() {
  return (
    <section id="cta" className="py-32 relative overflow-hidden proto-cta proto-cta--left proto-cta--actions-right" style={{ "--cta-accent": "var(--org)", "--cta-accent-text": "var(--org-on-light)", background: "transparent", color: "var(--foreground)" } as React.CSSProperties}>
      <div className="proto-cta__inner relative z-10">
        <div className="proto-cta__content">
          <div className="proto-section-eyebrow proto-section-eyebrow--cta proto-section-eyebrow--underline" data-observe="reveal-up">
            <span className="proto-section-eyebrow__rail" aria-hidden="true" />
            <span className="proto-section-eyebrow__copy">
              <span className="proto-section-eyebrow__name">Keamanan &amp; Data</span>
              <span className="proto-section-eyebrow__context">Demo &amp; lisensi</span>
            </span>
          </div>
          <h2 className="font-heading text-4xl lg:text-6xl mb-6 leading-[0.9]" style={{ fontWeight: "900", letterSpacing: "0", color: "var(--cream)" }} data-observe="signature-reveal">
            <span data-line="" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              Data Anda,
            </span>
            <span style={{ color: "var(--cta-accent-text)", "--stagger-index": "1" } as React.CSSProperties} data-line="">
              tetap milik Anda.
            </span>
          </h2>
          <p className="text-sm md:text-base mb-12 leading-relaxed max-w-[50ch] proto-cta__subtext" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }} data-observe="reveal-up">
            Hubungi kami untuk demo, lisensi, dan pemasangan Entaris di server perusahaan Anda.
          </p>
        </div>
        <aside className="proto-cta__action-rail" aria-label="Langkah berikutnya">
          <div className="flex flex-stack sm:flex-row items-center proto-cta__actions justify-start gap-6" data-observe="reveal-up">
            <Link href={DEMO_HREF} className="btn btn--primary btn--lg">
              Minta demo
              <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} />
            </Link>
            <Link href="/aira" className="btn btn--ghost btn--lg">
              Kenali AIRA
            </Link>
          </div>
        </aside>
        <aside className="proto-cta__meta" aria-label="Yang Anda dapat">
          <span className="proto-cta__meta-label">Yang Anda dapat</span>
          <ul className="sh-benefits">
            {BENEFITS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
