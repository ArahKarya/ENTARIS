import type { ComponentType, ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  ArrowRight, BarChart3, BookOpen, Factory, FileCheck2, Layers, LogIn, Mail, MessageCircle, MessagesSquare, ShoppingCart, Truck, type LucideProps,
} from 'lucide-react';
import { BrandMark, Wordmark } from '@/components/shared';
import { AiraIcon } from '@/components/shell/AiraIcon';

// Public product page for Entaris by PT Arah Karya Sinergi. Route /welcome;
// logged-in users are redirected to /. No animation loops: content is visible
// by default and only colour transitions run (motion-safe).

type Icon = ComponentType<LucideProps>;

const VENDOR = 'PT Arah Karya Sinergi';
const VENDOR_DOMAIN = 'arahkarya.com';
const DEFAULT_SALES_EMAIL = 'solutions@arahkarya.com';

/** Sales contact comes from build-time config; the WhatsApp button is hidden when no valid number is set. */
function readSalesContact(): { email: string; waLink: string | null } {
  const rawEmail = String(import.meta.env.VITE_SALES_EMAIL ?? '').trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : DEFAULT_SALES_EMAIL;
  const waDigits = String(import.meta.env.VITE_SALES_WHATSAPP ?? '').replace(/\D/g, '');
  const waLink = waDigits.length >= 8 && waDigits.length <= 15
    ? `https://wa.me/${waDigits}?text=`
    : null;
  return { email, waLink };
}

/** WhatsApp link with the greeting in the current UI language. */
function waHref(base: string): string {
  return `${base}${encodeURIComponent(i18n.t('landing.waMessage', { ns: 'auth' }))}`;
}

const SALES = readSalesContact();

type StepKey =
  | 'quotation' | 'salesOrder' | 'deliveryOrder' | 'salesInvoice' | 'payment'
  | 'purchaseOrder' | 'goodsReceipt' | 'purchaseInvoice'
  | 'stockByWarehouse' | 'transfer' | 'production' | 'stockCount'
  | 'autoJournal' | 'cashBank' | 'reconciliation' | 'statements';

/** Text: `auth:landing.workflows.<key>.{title,note}` and `auth:landing.steps.<step>`. */
const WORKFLOWS: ReadonlyArray<{ icon: Icon; key: 'sales' | 'purchasing' | 'inventory' | 'finance'; flow: readonly StepKey[] }> = [
  { icon: ShoppingCart, key: 'sales', flow: ['quotation', 'salesOrder', 'deliveryOrder', 'salesInvoice', 'payment'] },
  { icon: Truck, key: 'purchasing', flow: ['purchaseOrder', 'goodsReceipt', 'purchaseInvoice', 'payment'] },
  { icon: Factory, key: 'inventory', flow: ['stockByWarehouse', 'transfer', 'production', 'stockCount'] },
  { icon: BookOpen, key: 'finance', flow: ['autoJournal', 'cashBank', 'reconciliation', 'statements'] },
];

/** Text: `auth:landing.aira.points.<key>.{title,desc}`. */
const AIRA_POINTS: ReadonlyArray<{ icon: Icon; key: 'ask' | 'drafts' | 'ledger' }> = [
  { icon: MessagesSquare, key: 'ask' },
  { icon: FileCheck2, key: 'drafts' },
  { icon: Layers, key: 'ledger' },
];

/** Text: `auth:landing.principles.items.<key>.{title,desc}`. */
const PRINCIPLES = ['integrity', 'security', 'growth'] as const;

/** Static product schematic: how modules feed one ledger. Illustrative only, no figures. */
function FlowDiagram() {
  const { t } = useTranslation('auth');
  const sources: ReadonlyArray<{ icon: Icon; label: string }> = [
    { icon: ShoppingCart, label: t('landing.workflows.sales.title') },
    { icon: Truck, label: t('landing.workflows.purchasing.title') },
    { icon: Factory, label: t('landing.workflows.inventory.title') },
  ];
  const outputs: ReadonlyArray<{ icon: Icon; label: string }> = [
    { icon: BarChart3, label: t('landing.diagram.reports') },
    { icon: (p: LucideProps) => <AiraIcon size={16} className={p.className} tone="negative" />, label: t('landing.diagram.aira') },
  ];
  const node = 'flex items-center gap-2.5 rounded-lg border border-white/15 bg-[rgb(255_255_255/0.06)] px-3 py-2.5 text-sm text-white';
  const connector = <div aria-hidden className="mx-auto h-5 w-px bg-[rgb(255_255_255/0.25)]" />;

  return (
    <figure className="rounded-xl border border-white/15 bg-[rgb(255_255_255/0.04)] p-5 sm:p-6" aria-label={t('landing.diagram.label')}>
      <figcaption className="text-sm font-medium text-white/80">{t('landing.diagram.caption')}</figcaption>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {sources.map(({ icon: I, label }) => (
          <div key={label} className={node}>
            <I className="size-4 shrink-0 text-brand-blue-light" strokeWidth={1.75} aria-hidden />
            <span>{label}</span>
          </div>
        ))}
      </div>
      {connector}
      <div className="flex items-center gap-3 rounded-lg border border-brand-blue-light/40 bg-brand-blue-light/10 px-4 py-3 text-white">
        <BookOpen className="size-5 shrink-0 text-brand-blue-light" strokeWidth={1.75} aria-hidden />
        <div>
          <p className="text-sm font-semibold">{t('landing.diagram.ledger')}</p>
          <p className="text-xs text-white/75">{t('landing.diagram.ledgerNote')}</p>
        </div>
      </div>
      {connector}
      <div className="grid gap-2 sm:grid-cols-2">
        {outputs.map(({ icon: I, label }) => (
          <div key={label} className={node}>
            <I className="size-4 shrink-0 text-brand-blue-light" strokeWidth={1.75} aria-hidden />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function SectionHeading({ title, desc, id }: { title: string; desc?: ReactNode; id?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h2>
      {desc && <p className="mt-3 text-base leading-relaxed text-foreground-secondary">{desc}</p>}
    </div>
  );
}

const ctaOnNavy =
  'inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy';
const primaryOnNavy = `${ctaOnNavy} bg-[#FFFFFF] text-brand-navy hover:bg-[#E8EDF5]`;
const outlineOnNavy = `${ctaOnNavy} border border-white/40 text-white hover:bg-[rgb(255_255_255/0.1)]`;

function ContactButtons() {
  const { t } = useTranslation('auth');
  return (
    <>
      {SALES.waLink && (
        <a href={waHref(SALES.waLink)} target="_blank" rel="noopener noreferrer" className={outlineOnNavy}>
          <MessageCircle className="size-4" aria-hidden /> {t('landing.whatsappSales')}
        </a>
      )}
      <a href={`mailto:${SALES.email}`} className={outlineOnNavy}>
        <Mail className="size-4" aria-hidden /> {t('landing.contactSales')}
      </a>
    </>
  );
}

export default function LandingPage() {
  const { t } = useTranslation('auth');
  if (typeof window !== 'undefined' && localStorage.getItem('user')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#konten" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-[var(--shadow-2)]">
        {t('landing.skipToContent')}
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-navy">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label={t('landing.navLabel')}>
          <Link to="/welcome" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light">
            <Wordmark variant="negative" size="md" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-6">
            <a href="#modul" className="hidden text-sm font-medium text-white/80 hover:text-white md:block">{t('landing.navModules')}</a>
            <a href="#aira" className="hidden text-sm font-medium text-white/80 hover:text-white md:block">AIRA</a>
            <Link to="/login" className={`${primaryOnNavy} h-9 px-4`}>
              <LogIn className="size-4" aria-hidden /> {t('landing.signIn')}
            </Link>
          </div>
        </nav>
      </header>

      <main id="konten">
        {/* Hero */}
        <section className="relative overflow-hidden bg-brand-navy text-white" aria-labelledby="hero-title">
          <BrandMark variant="negative" size={560} title="" className="pointer-events-none absolute -right-40 -top-24 opacity-[0.05]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_0.95fr] md:pb-24 md:pt-20">
            <div>
              <h1 id="hero-title" className="text-[2rem] font-bold leading-[1.15] tracking-tight text-white md:text-5xl md:leading-[1.1]">
                {t('landing.hero.title')}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
                {t('landing.hero.body')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/login" className={primaryOnNavy}>
                  {t('landing.openApp')} <ArrowRight className="size-4" aria-hidden />
                </Link>
                <ContactButtons />
              </div>
            </div>
            <FlowDiagram />
          </div>
        </section>

        {/* Sectors */}
        <section className="border-b border-border bg-card" aria-label={t('landing.sectorsLabel')}>
          <p className="mx-auto max-w-6xl px-4 py-5 text-center text-sm text-foreground-secondary sm:px-6">
            {t('landing.sectors')}
          </p>
        </section>

        {/* Modules, by workflow */}
        <section id="modul" className="scroll-mt-16 py-16 md:py-24" aria-labelledby="modul-title">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              id="modul-title"
              title={t('landing.modules.title')}
              desc={t('landing.modules.desc')}
            />
            <ul className="mt-10 divide-y divide-border border-y border-border">
              {WORKFLOWS.map(({ icon: I, key, flow }) => {
                const title = t(`landing.workflows.${key}.title`);
                return (
                <li key={key} className="grid gap-3 py-6 md:grid-cols-[14rem_1fr] md:gap-8">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <I className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                    {title}
                  </h3>
                  <div>
                    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-medium text-foreground" aria-label={t('landing.flowLabel', { title })}>
                      {flow.map((step, k) => (
                        <li key={step} className="inline-flex items-center gap-2">
                          {k > 0 && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />}
                          <span className="rounded-sm border border-border bg-card px-2 py-1">{t(`landing.steps.${step}`)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{t(`landing.workflows.${key}.note`)}</p>
                  </div>
                </li>
                );
              })}
            </ul>
            <p className="mt-6 text-sm text-foreground-secondary">
              {t('landing.modules.approvals')}
            </p>
          </div>
        </section>

        {/* AIRA */}
        <section id="aira" className="scroll-mt-16 border-y border-border bg-card py-16 md:py-24" aria-labelledby="aira-title">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeading
              id="aira-title"
              title={t('landing.aira.title')}
              desc={t('landing.aira.desc')}
            />
            <ul className="flex flex-col gap-3">
              {AIRA_POINTS.map(({ icon: I, key }) => (
                <li key={key} className="flex gap-4 rounded-lg border border-border bg-background p-5">
                  <I className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t(`landing.aira.points.${key}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{t(`landing.aira.points.${key}.desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-border bg-card py-16 md:py-24" aria-labelledby="prinsip-title">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <SectionHeading
              id="prinsip-title"
              title={t('landing.principles.title')}
              desc={t('landing.principles.desc', { vendor: VENDOR })}
            />
            <ul className="flex flex-col divide-y divide-border">
              {PRINCIPLES.map((key) => (
                <li key={key} className="py-5 first:pt-0 last:pb-0">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t(`landing.principles.items.${key}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">{t(`landing.principles.items.${key}.desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-brand-navy py-16 text-white md:py-20" aria-labelledby="cta-title">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
            <BrandMark variant="negative" size={40} title="" />
            <h2 id="cta-title" className="mt-5 text-2xl font-bold tracking-tight text-white md:text-3xl">
              {t('landing.cta.title')}
            </h2>
            <p className="mt-3 max-w-xl text-base text-white/80">
              {t('landing.cta.body')}
            </p>
            <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link to="/login" className={primaryOnNavy}>
                <LogIn className="size-4" aria-hidden /> {t('landing.openApp')}
              </Link>
              <ContactButtons />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          {/* Plain lockup: the small Wordmark's #3D8BE0 "TA" is below 4.5:1 on light (axe color-contrast). */}
          <span className="inline-flex items-center gap-2 font-heading font-bold text-foreground">
            <BrandMark variant="auto" size={20} title="" /> Entaris
          </span>
          <p>
            © {new Date().getFullYear()} {VENDOR} ·{' '}
            <a href={`https://${VENDOR_DOMAIN}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
              {VENDOR_DOMAIN}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
