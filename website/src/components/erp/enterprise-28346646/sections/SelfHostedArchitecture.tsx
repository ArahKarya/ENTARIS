import { Fragment } from "react";
import { DATABASE_PATHS, SERVER_PATHS, TablerIcon } from "./TablerIcon";

/*
 * #arsitektur — the two Compose services (service ledger rows ported from the headless page)
 * followed by the startup sequence in the control-map card UI. Facts mirror README "Arsitektur".
 */
type ServiceRow = {
  name: string;
  iconName: string;
  paths: readonly string[];
  image: string;
  title: string;
  specs: readonly string[];
};

const SERVICES: readonly ServiceRow[] = [
  {
    name: "db",
    iconName: "database",
    paths: DATABASE_PATHS,
    image: "postgres:16-alpine",
    title: "PostgreSQL 16 — sumber kebenaran buku besar",
    specs: ["Port 5432 (internal)", "Volume pgdata → /var/lib/postgresql/data", "Healthcheck pg_isready"],
  },
  {
    name: "app",
    iconName: "server",
    paths: SERVER_PATHS,
    image: "build dari Dockerfile",
    title: "Express API + React SPA dari satu port",
    specs: ["Port 3001 → host", "Auto-migrate Prisma saat startup", "Auto-seed jika database kosong"],
  },
];

type StartupStep = { variant: string; label: string; title: string; body: string };

const STARTUP_STEPS: readonly StartupStep[] = [
  {
    variant: "identity",
    label: "Langkah 1 · db",
    title: "PostgreSQL siap",
    body: "Container db start dan lolos healthcheck pg_isready.",
  },
  {
    variant: "action",
    label: "Langkah 2 · app",
    title: "Menunggu db healthy",
    body: "Container app baru melanjutkan setelah database dinyatakan sehat.",
  },
  {
    variant: "gate",
    label: "Langkah 3 · migrasi",
    title: "79 migrasi otomatis",
    body: "Migrasi Prisma dan file SQL idempoten dijalankan tanpa langkah manual.",
  },
  {
    variant: "target",
    label: "Langkah 4 · seed",
    title: "Seed jika database kosong",
    body: "Bila belum ada user: bagan akun (COA), user admin, dan tahun fiskal dibuat.",
  },
];

const RESULT_ITEMS: readonly string[] = ["Express server :3001", "React SPA + API", "siap login"];

export function SelfHostedArchitecture() {
  return (
    <section id="arsitektur" className="role-section enterprise-map-section">
      <header className="role-intro">
        <p className="role-kicker">Arsitektur · Docker Compose</p>
        <h2>Dua container, satu perintah.</h2>
        <p>
          <code className="sh-inline-code">docker compose up -d</code> menyalakan database dan aplikasi di mesin Anda. Tidak ada layanan pihak ketiga yang wajib untuk menjalankan pembukuan.
        </p>
      </header>

      <div className="sh-services" data-observe="reveal-up">
        <div className="sh-services__command">
          <span aria-hidden="true">$</span>
          <code>docker compose up -d</code>
        </div>
        {SERVICES.map((service) => (
          <article key={service.name} className="sh-services__row">
            <div className="sh-services__name">
              <TablerIcon name={service.iconName} dataIcon={service.iconName} paths={service.paths} extraClass="headless-layer-icon" />
              <span>
                <strong>{service.name}</strong>
                <small>{service.image}</small>
              </span>
            </div>
            <div className="sh-services__body">
              <h3>{service.title}</h3>
              <ul>
                {service.specs.map((spec) => (
                  <li key={spec}>{spec}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      <figure className="enterprise-map sh-startup" data-observe="reveal-up">
        <figcaption>
          <span>Saat startup</span>
          <strong>db → app → migrasi → seed</strong>
          <span className="role-state">Otomatis</span>
        </figcaption>
        <div className="enterprise-map__canvas">
          {STARTUP_STEPS.map((step, index) => (
            <Fragment key={step.variant}>
              {index > 0 ? (
                <span className="enterprise-map__edge" aria-hidden="true">
                  →
                </span>
              ) : null}
              <article className={`enterprise-map__node enterprise-map__node--${step.variant}`}>
                <span>{step.label}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            </Fragment>
          ))}
        </div>
        <div className="enterprise-map__evidence">
          <strong>Hasil</strong>
          {RESULT_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </figure>
    </section>
  );
}
