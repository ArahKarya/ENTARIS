import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/shared/brand-mark';
import { setUiLanguage } from '@/i18n';
import { LANGUAGE_OPTIONS, normalizeLanguage } from '@/i18n/language';
import { authCopy, VENDOR_NAME, type AuthProduct } from './auth-copy';

/**
 * Concept A "Quiet split" (plan §3.2): flat navy brand panel (≥1024px) + a
 * borderless form column. Colours come from the theme tokens, so light/dark
 * follow the app theme. No motion except the form's 200ms fade (motion-safe).
 */
export interface AuthLayoutProps {
  /** Only 'ERP' remains (EAM is a module of the main app). Defaults to 'ERP'. */
  product?: AuthProduct;
  children: ReactNode;
  /** Opens the help dialog from the footer "Bantuan" link. */
  onHelp: () => void;
}

const PRIVACY_URL: string | undefined = import.meta.env.VITE_PRIVACY_URL || undefined;

const footerLink =
  'rounded-sm underline-offset-4 hover:text-(--text) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)';

function WordmarkText({ onDark }: { onDark: boolean }) {
  return (
    <span className="flex items-center gap-2" aria-hidden>
      <span
        className={
          'font-heading text-xl font-extrabold uppercase leading-none tracking-[0.04em] ' +
          (onDark ? 'text-white' : 'text-(--brand-navy) dark:text-(--text)')
        }
      >
        EN<span className={onDark ? 'text-[#9CC9F5]' : 'text-[#3D8BE0] dark:text-[#9CC9F5]'}>TA</span>RIS
      </span>
    </span>
  );
}

function BrandPanel({ product }: { product: AuthProduct }) {
  const { t } = useTranslation('auth');
  const copy = authCopy(product);
  const year = new Date().getFullYear();
  return (
    <aside
      aria-label={t('layout.about')}
      className="relative hidden overflow-hidden bg-(--brand-navy) px-12 py-12 text-white lg:flex lg:flex-col dark:border-r dark:border-(--border)"
    >
      {/* Static ∇ watermark, cropped at the bottom-right corner. */}
      <BrandMark
        variant="negative"
        size={520}
        title=""
        className="pointer-events-none absolute -bottom-36 -right-40 opacity-[0.05]"
      />

      <div className="relative flex items-center gap-3">
        <BrandMark variant="negative" size={36} title="" />
        <div className="flex flex-col gap-1.5">
          <span className="sr-only">Entaris</span>
          <WordmarkText onDark />
          <span className="text-xs font-medium uppercase leading-none tracking-[0.18em] text-white/75">
            Agentic Reasoning System
          </span>
        </div>
      </div>

      <div className="relative my-auto max-w-sm py-12">
        <p className="text-balance font-heading text-[2rem] font-semibold leading-[2.5rem] tracking-tight text-white">
          {copy.panelHeadline}
        </p>
        <ul className="mt-8 space-y-3">
          {copy.panelPoints.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[15px] leading-6 text-white/85">
              <Check className="mt-1 size-4 shrink-0 text-[#9CC9F5]" strokeWidth={2.25} aria-hidden />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/75">
        © {year} {VENDOR_NAME}
      </p>
    </aside>
  );
}

/**
 * Language choice before sign-in. Stored on this device only (setUiLanguage); after
 * sign-in the account's language wins. Two square-cornered buttons, no pills (DESIGN.md).
 */
function LanguageToggle() {
  const { t, i18n } = useTranslation('auth');
  const current = normalizeLanguage(i18n.language);
  return (
    <div role="group" aria-label={t('languageToggle.label')} className="inline-flex rounded-sm border border-(--border) p-0.5">
      {LANGUAGE_OPTIONS.map((option) => {
        const active = option.id === current;
        return (
          <button
            key={option.id}
            type="button"
            lang={option.id}
            aria-pressed={active}
            onClick={() => setUiLanguage(option.id)}
            className={
              'rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-(--surface-sunken) text-(--text)'
                : 'text-(--text-muted) hover:text-(--text)') +
              ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)'
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function FooterLinks({ onHelp }: { onHelp: () => void }) {
  const { t } = useTranslation('auth');
  return (
    <p className="flex items-center gap-2 text-xs text-(--text-muted)">
      <button type="button" onClick={onHelp} className={footerLink}>
        {t('layout.help')}
      </button>
      {PRIVACY_URL && (
        <>
          <span aria-hidden>·</span>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={footerLink}>
            {t('layout.privacy')}
          </a>
        </>
      )}
    </p>
  );
}

export function AuthLayout({ product = 'ERP', children, onHelp }: AuthLayoutProps) {
  const year = new Date().getFullYear();
  return (
    <div className="auth-root grid min-h-dvh bg-(--surface) text-(--text) lg:grid-cols-[5fr_7fr]">
      <BrandPanel product={product} />

      <main className="relative flex min-w-0 flex-col border-t-4 border-(--brand-navy) px-4 pb-8 pt-12 sm:px-6 lg:border-t-0 lg:px-12 lg:py-12">
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col lg:justify-center">
          {/* Mobile/tablet brand row (the panel carries it on desktop). */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark variant="auto" size={32} title="" />
            <span className="sr-only">Entaris</span>
            <WordmarkText onDark={false} />
          </div>

          <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">{children}</div>
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-[380px] flex-col gap-1 lg:items-center">
          <p className="text-xs text-(--text-muted) lg:hidden">
            © {year} {VENDOR_NAME}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-center lg:gap-4">
            <FooterLinks onHelp={onHelp} />
            <LanguageToggle />
          </div>
        </footer>
      </main>
    </div>
  );
}
