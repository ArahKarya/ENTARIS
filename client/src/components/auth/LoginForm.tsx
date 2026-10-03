import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { AUTH_COPY, type AuthProduct } from './auth-copy';
import { classifyLoginError, formatCountdown, safeRedirectTarget, type LoginFailure } from './login-helpers';

export interface LoginFormProps {
  product: AuthProduct;
  /** Workspace name for the chip; null hides it. */
  tenant: string | null;
  /** Show the "session ended" notice (?alasan=sesi). */
  sessionExpired?: boolean;
  /** Opens the "Lupa kata sandi?" dialog. */
  onForgotPassword: () => void;
}

type Phase = 'idle' | 'verifying' | 'redirecting';
interface FieldErrors {
  username?: string;
  password?: string;
}

const MESSAGES = {
  usernameRequired: 'Email atau username wajib diisi',
  passwordRequired: 'Kata sandi wajib diisi',
  invalid: 'Email/username atau kata sandi salah.',
  network: 'Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.',
  server: 'Terjadi kendala di server. Coba lagi beberapa saat lagi.',
  rateLimitedOpen: 'Terlalu banyak percobaan masuk. Coba lagi beberapa saat lagi.',
  sessionExpired: 'Sesi Anda berakhir. Silakan masuk kembali.',
} as const;

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)';

const inputClass =
  'block h-12 w-full rounded-md border border-(--input) bg-(--surface) px-3 text-base text-(--text) placeholder:text-(--text-muted) ' +
  'transition-[border-color,box-shadow] dark:bg-(--background) lg:h-11 lg:text-sm ' +
  'focus-visible:border-(--ring) aria-invalid:border-(--danger) disabled:cursor-not-allowed disabled:opacity-60 ' +
  focusRing;

const BANNER_TONES = {
  danger: 'border-(--danger)/40 bg-(--danger-subtle) text-(--danger-text)',
  warning: 'border-(--warning)/40 bg-(--warning-subtle) text-(--warning-text)',
  info: 'border-(--border) bg-(--surface-sunken) text-(--text-secondary)',
} as const;

function Banner({ tone, children, live = true }: { tone: keyof typeof BANNER_TONES; children: ReactNode; live?: boolean }) {
  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={live ? (tone === 'info' ? 'status' : 'alert') : undefined}
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-5 ${BANNER_TONES[tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1 text-[13px] font-medium leading-5 text-(--danger-text)">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Ticks `now` once a second until `until` has passed. The caller seeds `now`
 * when it sets `until` (inside its event handler), so no setState runs in the effect body.
 */
function useTicker(until: number | null, setNow: (value: number) => void): void {
  useEffect(() => {
    if (until === null) return undefined;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until, setNow]);
}

function failureMessage(failure: LoginFailure): string {
  if (failure.kind === 'invalid') return MESSAGES.invalid;
  if (failure.kind === 'network') return MESSAGES.network;
  if (failure.kind === 'server') return MESSAGES.server;
  return MESSAGES.rateLimitedOpen;
}

export function LoginForm({ product, tenant, sessionExpired = false, onForgotPassword }: LoginFormProps) {
  const copy = AUTH_COPY[product];
  const navigate = useNavigate();
  const location = useLocation();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [showSessionNotice, setShowSessionNotice] = useState(sessionExpired);
  /** Whole minutes announced once when the limiter kicks in (the visible timer is aria-hidden). */
  const [lockMinutes, setLockMinutes] = useState(0);

  const [now, setNow] = useState(0);

  const lockedUntil = failure?.kind === 'rate-limited' ? failure.lockedUntil : null;
  useTicker(lockedUntil, setNow);
  const remainingMs = lockedUntil === null ? 0 : Math.max(0, lockedUntil - now);
  const locked = lockedUntil !== null && remainingMs > 0;
  // A rate limit whose window has passed is no longer worth showing.
  const activeFailure = lockedUntil !== null && !locked ? null : failure;
  const busy = phase !== 'idle';

  // After wrong credentials, put the cursor back in the (now empty) password field
  // once the fields are re-enabled.
  useEffect(() => {
    if (failure?.kind === 'invalid' && phase === 'idle') passwordRef.current?.focus();
  }, [failure, phase]);

  // Focus the first field on desktop only (avoids popping the mobile keyboard).
  useEffect(() => {
    if (window.matchMedia?.('(min-width: 1024px)').matches) usernameRef.current?.focus();
  }, []);

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === 'function') setCapsLock(event.getModifierState('CapsLock'));
  };

  const validate = (): FieldErrors => ({
    ...(username.trim() ? {} : { username: MESSAGES.usernameRequired }),
    ...(password ? {} : { password: MESSAGES.passwordRequired }),
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || locked) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.username || nextErrors.password) {
      (nextErrors.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    setFailure(null);
    setShowSessionNotice(false);
    setPhase('verifying');
    try {
      const response = await api.post('/auth/login', { username: username.trim(), password });
      localStorage.setItem('user', JSON.stringify(response.data.user));
      setPhase('redirecting');
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(safeRedirectTarget(from), { replace: true });
    } catch (error: unknown) {
      const failedAt = Date.now();
      const result = classifyLoginError(error, failedAt);
      setNow(failedAt);
      if (result.kind === 'rate-limited' && result.lockedUntil !== null) {
        setLockMinutes(Math.max(1, Math.ceil((result.lockedUntil - failedAt) / 60_000)));
      }
      setFailure(result);
      setPhase('idle');
      if (result.kind === 'invalid') setPassword('');
    }
  };

  const usernameErrorId = 'login-username-error';
  const passwordErrorId = 'login-password-error';
  const capsId = 'login-password-caps';
  const passwordDescribedBy = [errors.password ? passwordErrorId : null, capsLock ? capsId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div>
      <header className="mb-8">
        {tenant && (
          <p className="mb-4 hidden max-w-full truncate rounded-full border border-(--border) bg-(--surface-sunken) px-3 py-1 text-[13px] leading-5 text-(--text-secondary) lg:inline-block">
            Ruang kerja · <span className="font-medium text-(--text)">{tenant}</span>
          </p>
        )}
        <h1 className="font-heading text-2xl font-semibold leading-8 tracking-tight text-(--text)">{copy.heading}</h1>
        {tenant && (
          <p className="mt-1 truncate text-[13px] leading-5 text-(--text-muted) lg:hidden">Ruang kerja · {tenant}</p>
        )}
        <p className="mt-2 hidden text-pretty text-sm leading-5 text-(--text-secondary) lg:block">{copy.subtitle}</p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {showSessionNotice && <Banner tone="info">{MESSAGES.sessionExpired}</Banner>}

        {locked && (
          <>
            <p role="alert" className="sr-only">
              {`Terlalu banyak percobaan masuk. Coba lagi dalam sekitar ${lockMinutes} menit.`}
            </p>
            <Banner tone="warning" live={false}>
              <span aria-hidden>
                Terlalu banyak percobaan masuk. Coba lagi dalam{' '}
                <span className="font-semibold tabular-nums">{formatCountdown(remainingMs)}</span>.
              </span>
            </Banner>
          </>
        )}
        {activeFailure && !locked && (
          <Banner tone={activeFailure.kind === 'rate-limited' ? 'warning' : 'danger'}>
            {failureMessage(activeFailure)}
          </Banner>
        )}

        <div>
          <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium leading-5 text-(--text)">
            Email atau username
          </label>
          <input
            ref={usernameRef}
            id="login-username"
            name="username"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
            }}
            onKeyDown={trackCapsLock}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? usernameErrorId : undefined}
            disabled={busy}
            className={inputClass}
          />
          {errors.username && <FieldError id={usernameErrorId}>{errors.username}</FieldError>}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="block text-sm font-medium leading-5 text-(--text)">
              Kata sandi
            </label>
            <button
              type="button"
              onClick={onForgotPassword}
              className={`rounded-sm text-[13px] font-medium leading-5 text-(--primary) underline-offset-4 hover:underline ${focusRing}`}
            >
              Lupa kata sandi?
            </button>
          </div>
          <div className="relative">
            <input
              ref={passwordRef}
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={passwordDescribedBy}
              disabled={busy}
              className={`${inputClass} pr-28`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-controls="login-password"
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2.5 py-1.5 text-[13px] font-medium text-(--text-secondary) hover:bg-(--surface-sunken) hover:text-(--text) ${focusRing}`}
            >
              {showPassword ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          </div>
          {errors.password && <FieldError id={passwordErrorId}>{errors.password}</FieldError>}
          {capsLock && (
            <p id={capsId} className="mt-1.5 flex items-center gap-1 text-[13px] font-medium leading-5 text-(--warning-text)">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              Caps Lock aktif
            </p>
          )}
        </div>

        <button
          type="submit"
          // aria-disabled (not disabled) so a focused button keeps focus when the
          // limiter kicks in; handleSubmit ignores submits while locked.
          aria-disabled={locked || undefined}
          aria-busy={busy || undefined}
          className={
            'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-(--primary) px-4 text-base font-semibold text-(--primary-foreground) ' +
            'transition-colors hover:bg-(--primary-hover) active:bg-[#22406E] dark:active:bg-[#4A8AD8] lg:h-11 lg:text-sm ' +
            'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:bg-(--primary) aria-disabled:active:bg-(--primary) aria-busy:cursor-progress ' +
            focusRing
          }
        >
          {busy && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
          {phase === 'verifying' ? 'Memverifikasi…' : phase === 'redirecting' ? 'Mengalihkan…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
