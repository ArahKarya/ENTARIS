import Link from "next/link";
import { DEMO_HREF } from "@/components/site/siteConfig";
import { ARROW_RIGHT_PATHS, BUTTON_ICON_STYLE, TablerIcon } from "./TablerIcon";

/*
 * #cta — closing card with a quickstart panel. Commands are copied from README "Quickstart
 * (Docker)"; secrets and default passwords are deliberately left out.
 */
type QuickstartLine = { kind: "cmd" | "comment"; text: string };

const QUICKSTART_LINES: readonly QuickstartLine[] = [
  { kind: "comment", text: "# akses repositori diberikan bersama lisensi (solutions@arahkarya.com)" },
  { kind: "cmd", text: "git clone <url-repositori-lisensi> entaris" },
  { kind: "cmd", text: "cd entaris" },
  { kind: "cmd", text: "cp .env.docker.example .env" },
  { kind: "comment", text: "# edit .env — wajib ganti JWT_SECRET (openssl rand -hex 48)" },
  { kind: "cmd", text: "docker compose up -d --build" },
  { kind: "comment", text: "# buka http://localhost:3001" },
];

export function SelfHostedCta() {
  return (
    <section id="cta" className="py-32 relative overflow-hidden proto-cta proto-cta--left proto-cta--actions-right" style={{ "--cta-accent": "var(--org)", "--cta-accent-text": "var(--org-on-light)", background: "transparent", color: "var(--foreground)" } as React.CSSProperties}>
      <div className="proto-cta__inner relative z-10">
        <div className="proto-cta__content">
          <div className="proto-section-eyebrow proto-section-eyebrow--cta proto-section-eyebrow--underline" data-observe="reveal-up">
            <span className="proto-section-eyebrow__rail" aria-hidden="true" />
            <span className="proto-section-eyebrow__copy">
              <span className="proto-section-eyebrow__name">Self-hosted</span>
              <span className="proto-section-eyebrow__context">Lisensi & pemasangan</span>
            </span>
          </div>
          <h2 className="font-heading text-4xl lg:text-6xl mb-6 leading-[0.9]" style={{ fontWeight: "900", letterSpacing: "0", color: "var(--cream)" }} data-observe="signature-reveal">
            <span data-line="" style={{ "--stagger-index": "0" } as React.CSSProperties}>
              Pasang di server
            </span>
            <span style={{ color: "var(--cta-accent-text)", "--stagger-index": "1" } as React.CSSProperties} data-line="">
              Anda sendiri.
            </span>
          </h2>
          <p className="text-sm md:text-base mb-12 leading-relaxed max-w-[50ch] proto-cta__subtext" style={{ fontFamily: "var(--font-body)", color: "var(--text-m)" }} data-observe="reveal-up">
            Entaris berlisensi proprietary. Hubungi kami untuk demo, lisensi, dan pendampingan pemasangan di infrastruktur Anda.
          </p>
        </div>
        <aside className="proto-cta__action-rail" aria-label="Langkah berikutnya">
          <div className="flex flex-stack sm:flex-row items-center proto-cta__actions justify-start gap-6" data-observe="reveal-up">
            <a href={DEMO_HREF} className="btn btn--primary btn--lg">
              Minta demo
              <TablerIcon name="arrow-right" dataIcon="arrow-right" paths={ARROW_RIGHT_PATHS} style={BUTTON_ICON_STYLE} />
            </a>
            <Link href="/aira" className="btn btn--ghost btn--lg">
              Kenali AIRA
            </Link>
          </div>
        </aside>
        <aside className="proto-cta__meta" aria-label="Quickstart">
          <span className="proto-cta__meta-label">Quickstart · Docker</span>
          <pre className="sh-quickstart" tabIndex={0} aria-label="Perintah quickstart">
            <code>
              {QUICKSTART_LINES.map((line) => (
                <span key={line.text} className={line.kind === "comment" ? "sh-quickstart__comment" : "sh-quickstart__cmd"}>
                  {line.text}
                </span>
              ))}
            </code>
          </pre>
        </aside>
      </div>
    </section>
  );
}
