import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { BrandMark } from '@/components/shared/brand-mark';
import { AUTH_COPY, VENDOR_NAME, type AuthProduct } from './auth-copy';

/**
 * Concept A "Quiet split" (plan §3.2): flat navy brand panel (≥1024px) + a
 * borderless form column. Colours come from the theme tokens, so light/dark
 * follow the app theme. No motion except the form's 200ms fade (motion-safe).
 *
 * Kept free of app-specific ui primitives so the file can be copied verbatim
 * into client-eam (only the BrandMark/token imports differ).
 */
export interface AuthLayoutProps {
  product: AuthProduct;
  children: ReactNode;
  /** Opens the help dialog from the footer "Bantuan" link. */
  onHelp: () => void;
}

const PRIVACY_URL: string | undefined = import.meta.env.VITE_PRIVACY_URL || undefined;

const footerLink =
  'rounded-sm underline-offset-4 hover:text-(--text) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)';

function WordmarkText({ product, onDark }: { product: AuthProduct; onDark: boolean }) {
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
      {product === 'EAM' && (
        <span
          className={
            'rounded-sm border px-1.5 py-0.5 text-xs font-semibold leading-none tracking-wide ' +
            (onDark ? 'border-white/50 text-white' : 'border-(--input) text-(--text-secondary)')
          }
        >
          EAM
        </span>
      )}
    </span>
  );
}

function BrandPanel({ product }: { product: AuthProduct }) {
  const copy = AUTH_COPY[product];
  const year = new Date().getFullYear();
  return (
    <aside
      aria-label="Tentang Entaris"
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
          <span className="sr-only">{product === 'EAM' ? 'Entaris EAM' : 'Entaris'}</span>
          <WordmarkText product={product} onDark />
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

function FooterLinks({ onHelp }: { onHelp: () => void }) {
  return (
    <p className="flex items-center gap-2 text-xs text-(--text-muted)">
      <button type="button" onClick={onHelp} className={footerLink}>
        Bantuan
      </button>
      {PRIVACY_URL && (
        <>
          <span aria-hidden>·</span>
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={footerLink}>
            Kebijakan Privasi
          </a>
        </>
      )}
    </p>
  );
}

export function AuthLayout({ product, children, onHelp }: AuthLayoutProps) {
  const year = new Date().getFullYear();
  return (
    <div className="auth-root grid min-h-dvh bg-(--surface) text-(--text) lg:grid-cols-[5fr_7fr]">
      <BrandPanel product={product} />

      <main className="relative flex min-w-0 flex-col border-t-4 border-(--brand-navy) px-4 pb-8 pt-12 sm:px-6 lg:border-t-0 lg:px-12 lg:py-12">
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col lg:justify-center">
          {/* Mobile/tablet brand row (the panel carries it on desktop). */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <BrandMark variant="auto" size={32} title="" />
            <span className="sr-only">{product === 'EAM' ? 'Entaris EAM' : 'Entaris'}</span>
            <WordmarkText product={product} onDark={false} />
          </div>

          <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">{children}</div>
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-[380px] flex-col gap-1 lg:items-center">
          <p className="text-xs text-(--text-muted) lg:hidden">
            © {year} {VENDOR_NAME}
          </p>
          <FooterLinks onHelp={onHelp} />
        </footer>
      </main>
    </div>
  );
}
