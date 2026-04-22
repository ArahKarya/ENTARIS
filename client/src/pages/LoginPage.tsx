import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Lock, User, AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../lib/version';

interface PublicBranding {
  companyName: string | null;
  logoUrl: string | null;
}

const animStyles = `
@keyframes login-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<PublicBranding>({ companyName: null, logoUrl: null });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .get<PublicBranding>('/public/branding')
      .then((res) => {
        if (!cancelled) setBranding(res.data);
      })
      .catch(() => {
        /* ignore — fallback to defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/login', { username, password });
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Login gagal. Periksa kembali email dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  const displayName = branding.companyName || 'Simple ERP';

  return (
    <>
      <style>{animStyles}</style>

      <div className="min-h-screen flex items-stretch bg-neutral-50 dark:bg-neutral-950">
        {/* ── Left panel: brand/industrial ─────────────────────────────── */}
        <aside
          className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden flex-col justify-between p-12 text-neutral-100"
          style={{
            backgroundColor: '#1c1f23',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.06), transparent 60%),' +
                'radial-gradient(circle at 80% 90%, rgba(255,255,255,0.04), transparent 55%)',
            }}
          />

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-white/5 ring-1 ring-white/10 flex items-center justify-center overflow-hidden">
              <img
                src={branding.logoUrl || '/pwa-512x512.png'}
                alt={displayName}
                className="w-7 h-7 object-contain invert opacity-90"
              />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Simple ERP</div>
              <div className="text-sm font-medium text-neutral-200">{displayName}</div>
            </div>
          </div>

          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400 mb-4">
              Sistem ERP Keuangan & Operasional
            </div>
            <h2 className="text-[34px] leading-[1.15] font-semibold text-neutral-100 tracking-tight">
              Pembukuan yang rapi,
              <br />
              operasi yang terukur.
            </h2>
            <p className="mt-5 text-sm text-neutral-400 max-w-md leading-relaxed">
              Double-entry bookkeeping, manajemen stok & produksi, aset tetap, dan laporan
              keuangan lengkap — semua dalam satu sistem.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-6 text-neutral-400 text-xs">
            <div>
              <div className="text-2xl font-semibold text-neutral-200 tabular-nums">200+</div>
              <div className="mt-1 uppercase tracking-wider">Akun COA</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-200 tabular-nums">10</div>
              <div className="mt-1 uppercase tracking-wider">Modul Inti</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-neutral-200 tabular-nums">4</div>
              <div className="mt-1 uppercase tracking-wider">Role Akses</div>
            </div>
          </div>
        </aside>

        {/* ── Right panel: login form ──────────────────────────────────── */}
        <main className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50 dark:bg-neutral-950">
          <div
            className="w-full max-w-[380px]"
            style={{ animation: 'login-fade-up 0.5s ease-out both' }}
          >
            {/* Mobile brand (only on <lg) */}
            <div className="flex lg:hidden items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-md bg-neutral-900 dark:bg-neutral-100 flex items-center justify-center overflow-hidden">
                <img
                  src={branding.logoUrl || '/pwa-512x512.png'}
                  alt={displayName}
                  className="w-7 h-7 object-contain invert dark:invert-0 opacity-90"
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">Simple ERP</div>
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</div>
              </div>
            </div>

            <div className="mb-8">
              <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-2">Masuk</div>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                Selamat datang kembali
              </h1>
              <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                Masuk ke akun {displayName} Anda untuk melanjutkan.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 p-3 rounded-md flex items-start gap-2.5 text-[13px] bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-[11px] uppercase tracking-[0.18em] font-medium mb-2 text-neutral-600 dark:text-neutral-400"
                >
                  Email atau Username
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-neutral-400 dark:text-neutral-500"
                  />
                  <input
                    id="login-email"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    placeholder="nama@perusahaan.com"
                    required
                    className="w-full rounded-md py-2.5 pl-10 pr-3 text-sm outline-none border transition-colors
                      bg-white dark:bg-neutral-900
                      text-neutral-900 dark:text-neutral-100
                      placeholder:text-neutral-400 dark:placeholder:text-neutral-600
                      border-neutral-300 dark:border-neutral-800
                      focus:border-neutral-900 dark:focus:border-neutral-300"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-[11px] uppercase tracking-[0.18em] font-medium mb-2 text-neutral-600 dark:text-neutral-400"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-neutral-400 dark:text-neutral-500"
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    required
                    className="w-full rounded-md py-2.5 pl-10 pr-10 text-sm outline-none border transition-colors
                      bg-white dark:bg-neutral-900
                      text-neutral-900 dark:text-neutral-100
                      placeholder:text-neutral-400 dark:placeholder:text-neutral-600
                      border-neutral-300 dark:border-neutral-800
                      focus:border-neutral-900 dark:focus:border-neutral-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors
                  bg-neutral-900 text-white hover:bg-neutral-800
                  dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white
                  disabled:opacity-60 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 focus:ring-offset-neutral-50 dark:focus:ring-offset-neutral-950"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-500">
              <span>
                Lupa password?{' '}
                <span className="text-neutral-700 dark:text-neutral-300 font-medium">Hubungi Administrator</span>
              </span>
              <span className="font-mono tabular-nums">
                v{APP_VERSION} · {APP_BUILD_DATE}
              </span>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default LoginPage;
