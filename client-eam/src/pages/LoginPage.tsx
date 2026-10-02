import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User,
  Wrench, Car, Building2, ScanLine, ClipboardList, HardHat,
  Boxes, ShieldCheck, Gauge, Cog,
} from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../lib/version';

interface PublicBranding {
  companyName: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
}

// ─── Animations (inline CSS — login is pre-Tailwind-config pages) ───────────
const animStyles = `
@keyframes login-fade-up { from { opacity: 0; transform: translateY(10px);} to { opacity: 1; transform: translateY(0);} }
@keyframes login-fade-left { from { opacity: 0; transform: translateX(-12px);} to { opacity: 1; transform: translateX(0);} }
@keyframes login-fade-right { from { opacity: 0; transform: translateX(12px);} to { opacity: 1; transform: translateX(0);} }
@keyframes login-drift-up { from { transform: translateY(0); opacity: 0;} 10% { opacity: 1;} 90% { opacity: 1;} to { transform: translateY(-110vh); opacity: 0;} }
@keyframes login-float-slow { 0%, 100% { transform: translateY(0);} 50% { transform: translateY(-14px);} }
@keyframes login-float-medium { 0%, 100% { transform: translateY(0);} 50% { transform: translateY(-8px);} }
@keyframes login-float-fast { 0%, 100% { transform: translateY(0);} 50% { transform: translateY(-5px);} }
@keyframes login-bob { 0%, 100% { transform: translateY(0);} 50% { transform: translateY(-3px);} }
@keyframes login-sonar { 0% { opacity: 0.7; transform: scale(1);} 75%, 100% { opacity: 0; transform: scale(1.7);} }
@keyframes login-pulse-soft { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0);} 50% { box-shadow: 0 0 0 10px rgba(255,255,255,0.06);} }
@keyframes login-gradient-flow { 0%, 100% { background-position: 0% 50%;} 50% { background-position: 100% 50%;} }
@keyframes login-spin-slow { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
@keyframes login-wave-x { from { transform: translateX(0);} to { transform: translateX(-50%);} }
@keyframes login-shine { 0% { transform: translateX(-100%);} 100% { transform: translateX(200%);} }
`;

// Hook: count from 0 → target with ease-out (runs once).
function useCounter(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ─── Brand panel decorations ────────────────────────────────────────────────
const ERP_ICONS = [
  Wrench, Car, Building2, ScanLine, ClipboardList, HardHat,
  Boxes, Cog, Gauge,
];
// Palet selaras favicon: steel blue + sedikit aksen gold (grain) + putih.
const ICON_TINTS = ['text-white/10', 'text-white/15', 'text-blue-200/18', 'text-sky-200/14', 'text-amber-200/12'];
const FLOAT_ANIMS = ['login-float-slow', 'login-float-medium', 'login-float-fast', 'login-bob'];
const PARTICLE_COLORS = [
  'rgba(255,255,255,0.35)',
  'rgba(219,234,254,0.34)', // blue-100
  'rgba(186,230,253,0.30)', // sky-200
  'rgba(252,211,77,0.28)',  // amber-300 (grain accent)
];

type Particle = { id: number; left: number; size: number; duration: number; delay: number; color: string; ring: boolean };
type FloatIcon = { id: number; Icon: typeof Wrench; top: string; left: string; size: number; duration: number; delay: number; tint: string; anim: string };

interface BrandPanelProps {
  displayName: string;
  logoSrc: string;
  needsInvert: boolean;
}

const BrandPanel: React.FC<BrandPanelProps> = ({ displayName, logoSrc, needsInvert }) => {
  const year = new Date().getFullYear();
  const akun = useCounter(146, 1300);
  const modul = useCounter(8, 900);
  const role = useCounter(6, 700);

  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 3 + Math.random() * 6,
      duration: 14 + Math.random() * 14,
      delay: -Math.random() * 18,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]!,
      ring: Math.random() > 0.75,
    })),
  );

  const [icons] = useState<FloatIcon[]>(() =>
    Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      Icon: ERP_ICONS[i % ERP_ICONS.length]!,
      top: `${6 + Math.random() * 82}%`,
      left: `${5 + Math.random() * 88}%`,
      size: 26 + Math.random() * 36,
      duration: 5 + Math.random() * 7,
      delay: -Math.random() * 6,
      tint: ICON_TINTS[i % ICON_TINTS.length]!,
      anim: FLOAT_ANIMS[i % FLOAT_ANIMS.length]!,
    })),
  );

  const sonarDelays = ['0s', '0.8s', '1.6s', '2.4s'];

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:justify-between relative overflow-hidden text-white px-12 py-12"
      style={{
        // Selaras favicon: steel blue → deep navy.
        // #3a5d8f (steel) → #1e3a5f (deep navy) sebagai dua titik utama, +shade.
        backgroundImage:
          'linear-gradient(135deg, #0b2e26 0%, #124a3d 25%, #1c6b56 50%, #2f8f6e 75%, #124a3d 100%)',
        backgroundSize: '300% 300%',
        animation: 'login-gradient-flow 14s ease infinite',
      }}
    >
      {/* Rotating halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/3 -top-1/3 h-[140%] w-[140%] opacity-40"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.06) 60deg, transparent 120deg, rgba(255,255,255,0.05) 200deg, transparent 260deg, rgba(255,255,255,0.05) 320deg, transparent 360deg)',
          animation: 'login-spin-slow 30s linear infinite',
        }}
      />

      {/* Particles drifting upward */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute bottom-[-20px] rounded-full"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.ring ? 'transparent' : p.color,
              border: p.ring ? `1px solid ${p.color}` : 'none',
              animation: `login-drift-up ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Floating ERP icons */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {icons.map((f) => {
          const Icon = f.Icon;
          return (
            <Icon
              key={f.id}
              className={`absolute ${f.tint}`}
              style={{
                top: f.top,
                left: f.left,
                width: f.size,
                height: f.size,
                animation: `${f.anim} ${f.duration}s ease-in-out ${f.delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Bottom wave */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 overflow-hidden">
        <svg
          className="absolute inset-x-0 bottom-0 h-full w-[200%]"
          viewBox="0 0 1440 120"
          preserveAspectRatio="none"
          style={{ animation: 'login-wave-x 22s linear infinite' }}
        >
          <path d="M0,64 C240,96 480,32 720,64 C960,96 1200,32 1440,64 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.06)" />
          <path d="M0,80 C240,48 480,112 720,80 C960,48 1200,112 1440,80 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.04)" transform="translate(0,8)" />
        </svg>
      </div>

      {/* Header — logo + sonar + title */}
      <div className="relative" style={{ animation: 'login-fade-left 0.7s ease both' }}>
        <div className="relative inline-flex h-16 w-16 items-center justify-center">
          {sonarDelays.map((d) => (
            <span
              key={d}
              aria-hidden
              className="absolute inset-0 rounded-2xl ring-2 ring-white/40"
              style={{ animation: `login-sonar 2.4s ease-out ${d} infinite` }}
            />
          ))}
          <div
            className="relative flex h-full w-full items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm overflow-hidden"
            style={{ animation: 'login-pulse-soft 3s ease-in-out infinite' }}
          >
            <img
              src={logoSrc}
              alt={displayName}
              className={`w-9 h-9 object-contain ${needsInvert ? 'invert' : ''}`}
            />
          </div>
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.22em] text-white/70">
          Enterprise Asset Management
        </p>
        <h1
          className="mt-3 text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight"
          style={{
            // Selaras favicon: putih → light blue → gold (grain) → putih.
            backgroundImage: 'linear-gradient(120deg, #ffffff 0%, #d1fae5 35%, #a7f3d0 65%, #ffffff 100%)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            animation: 'login-gradient-flow 6s ease infinite',
          }}
        >
          {displayName}
        </h1>
        <p className="mt-4 max-w-md text-base md:text-lg leading-relaxed text-white/90">
          Kelola aset tetap, kendaraan, gedung, dan maintenance dalam satu sistem.
          Terhubung real-time dengan data ERP perusahaan.
        </p>
      </div>

      {/* Feature pills */}
      <div className="relative mt-6 flex flex-wrap gap-2" style={{ animation: 'login-fade-up 0.7s ease 0.2s both' }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          Live · Sinkron dengan ERP
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 backdrop-blur-sm">
          <ShieldCheck className="h-3.5 w-3.5" /> Audit trail + RBAC
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 backdrop-blur-sm">
          <Wrench className="h-3.5 w-3.5" /> Work Order & Jadwal
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 backdrop-blur-sm">
          <Car className="h-3.5 w-3.5" /> Kendaraan & Servis
        </span>
      </div>

      {/* Animated stats */}
      <div className="relative mt-6 grid max-w-md grid-cols-3 gap-4" style={{ animation: 'login-fade-up 0.7s ease 0.3s both' }}>
        <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="text-2xl md:text-3xl font-bold tabular-nums">{akun}+</p>
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-white/70">Aset Terdata</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="text-2xl md:text-3xl font-bold tabular-nums">{modul}</p>
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-white/70">Modul EAM</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="text-2xl md:text-3xl font-bold tabular-nums">{role}</p>
          <p className="text-[10px] md:text-xs uppercase tracking-wider text-white/70">Kategori Aset</p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative mt-6 space-y-1" style={{ animation: 'login-fade-up 1s ease 0.5s both' }}>
        <p className="text-[11px] text-white/60">
          © {year} {displayName} · Data terenkripsi &amp; tunduk kebijakan privasi perusahaan.
        </p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">
          Arah Karya Sinergi&trade; · by Yayang Setya Nugroho
        </p>
      </div>
    </aside>
  );
};

// ─── Main login page ────────────────────────────────────────────────────────
const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<PublicBranding>({ companyName: null, logoUrl: null, logoUrlDark: null });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api.get<PublicBranding>('/public/branding')
      .then((res) => { if (!cancelled) setBranding(res.data); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
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
  // Brand panel selalu di atas gradient gelap → prefer logo dark variant.
  const panelLogo = branding.logoUrlDark || branding.logoUrl || '/pwa-512x512.png';
  const panelNeedsInvert = !branding.logoUrlDark && !branding.logoUrl;
  // Mobile brand (di form panel) ikut tema aplikasi.
  const mobileLogo = isDark
    ? (branding.logoUrlDark || branding.logoUrl || '/pwa-512x512.png')
    : (branding.logoUrl || branding.logoUrlDark || '/pwa-512x512.png');
  const mobileNeedsInvert = !branding.logoUrl && !branding.logoUrlDark && !isDark;

  return (
    <>
      <style>{animStyles}</style>

      <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-neutral-50 dark:bg-neutral-950">
        <BrandPanel displayName={displayName} logoSrc={panelLogo} needsInvert={panelNeedsInvert} />

        {/* Form panel */}
        <main className="flex items-center justify-center px-6 py-12 lg:py-16">
          <div className="w-full max-w-[400px]" style={{ animation: 'login-fade-right 0.6s ease both' }}>
            {/* Mobile brand (only <lg) */}
            <div className="flex lg:hidden items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-md bg-neutral-900 dark:bg-neutral-100 flex items-center justify-center overflow-hidden">
                <img
                  src={mobileLogo}
                  alt={displayName}
                  className={`w-7 h-7 object-contain opacity-90 ${mobileNeedsInvert ? 'invert' : ''}`}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">EAM</div>
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl shadow-[#124a3d]/10 p-7 md:p-8">
              <div className="mb-6">
                <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500 mb-1.5">Masuk</div>
                <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Selamat datang kembali
                </h2>
                <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                  Masuk ke akun {displayName} Anda untuk melanjutkan.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                    style={{ animation: 'login-fade-up 0.2s ease both' }}
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="leading-snug">{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="login-username" className="block text-[11px] uppercase tracking-[0.18em] font-medium mb-2 text-neutral-600 dark:text-neutral-400">
                    Email atau Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                    <input
                      id="login-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      placeholder="nama@perusahaan.com"
                      required
                      disabled={loading}
                      className="w-full h-11 rounded-md pl-10 pr-3 text-sm outline-none border transition-all
                        bg-white dark:bg-neutral-900
                        text-neutral-900 dark:text-neutral-100
                        placeholder:text-neutral-400 dark:placeholder:text-neutral-600
                        border-neutral-300 dark:border-neutral-800
                        focus:border-[#3a5d8f] dark:focus:border-[#5a7daf]
                        focus:ring-2 focus:ring-[#3a5d8f]/20
                        disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="login-password" className="block text-[11px] uppercase tracking-[0.18em] font-medium text-neutral-600 dark:text-neutral-400">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-[#3a5d8f] dark:text-[#7a9dcf] hover:underline underline-offset-2"
                      onClick={() => alert('Hubungi administrator untuk reset password.')}
                    >
                      Lupa?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                      className="w-full h-11 rounded-md pl-10 pr-10 text-sm outline-none border transition-all
                        bg-white dark:bg-neutral-900
                        text-neutral-900 dark:text-neutral-100
                        placeholder:text-neutral-400 dark:placeholder:text-neutral-600
                        border-neutral-300 dark:border-neutral-800
                        focus:border-[#3a5d8f] dark:focus:border-[#5a7daf]
                        focus:ring-2 focus:ring-[#3a5d8f]/20
                        disabled:opacity-60"
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
                  className="group relative w-full h-11 overflow-hidden rounded-md text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0
                    bg-gradient-to-r from-[#3a5d8f] to-[#1e3a5f]
                    hover:from-[#4a6d9f] hover:to-[#2a4a7a]
                    shadow-lg shadow-[#1e3a5f]/30
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0
                    focus:outline-none focus:ring-2 focus:ring-[#3a5d8f] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-neutral-900"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                  <span className="relative inline-flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      <>
                        Masuk
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>

            <div className="mt-6 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-500 px-1">
              <span>
                Butuh bantuan?{' '}
                <span className="text-neutral-700 dark:text-neutral-300 font-medium">Hubungi Administrator</span>
              </span>
              <span className="font-mono tabular-nums">
                v{APP_VERSION} · {APP_BUILD_DATE}
              </span>
            </div>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600">
              Arah Karya Sinergi&trade; · by Yayang Setya Nugroho
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default LoginPage;
