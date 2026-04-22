import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '../lib/version';

/* ── Animated mesh background (canvas) ──────────────────────────────── */

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
}

function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // More particles, wider spread
    const count = Math.min(Math.floor((window.innerWidth * window.innerHeight) / 12000), 90);
    const points: Point[] = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2.5 + 1.5,
        hue: 200 + Math.random() * 40, // blue-cyan range
      });
    }
    pointsRef.current = points;

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouse);

    const isDark = () => document.documentElement.classList.contains('dark');
    const maxDist = 180;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dark = isDark();
      const mouse = mouseRef.current;

      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Mouse repel with stronger force
        const dmx = p.x - mouse.x;
        const dmy = p.y - mouse.y;
        const dmDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dmDist < 150) {
          p.x += (dmx / dmDist) * 2.5;
          p.y += (dmy / dmDist) * 2.5;
        }
      }

      // Draw lines between nearby points — much bolder
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * (dark ? 0.35 : 0.4);
            ctx.beginPath();
            ctx.strokeStyle = dark
              ? `rgba(148,180,230,${alpha})`
              : `rgba(59,130,246,${alpha})`;
            ctx.lineWidth = 1.2;
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw points — larger, with glow
      for (const p of points) {
        // Glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        grad.addColorStop(0, dark
          ? `hsla(${p.hue},60%,70%,0.6)`
          : `hsla(${p.hue},80%,55%,0.5)`);
        grad.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.fillStyle = dark
          ? `hsla(${p.hue},60%,75%,0.8)`
          : `hsla(${p.hue},80%,50%,0.75)`;
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mouse lines — brighter, thicker
      for (const p of points) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist * 1.4) {
          const alpha = (1 - dist / (maxDist * 1.4)) * (dark ? 0.5 : 0.55);
          ctx.beginPath();
          ctx.strokeStyle = dark
            ? `rgba(120,180,255,${alpha})`
            : `rgba(37,99,235,${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ zIndex: 0, pointerEvents: 'auto' }}
    />
  );
}

/* ── Floating financial symbols ─────────────────────────────────────── */

const FLOAT_SYMBOLS = ['Rp', '%', '$', '¥', '€', '₿', '📊', '📈'];

function FloatingSymbols() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {FLOAT_SYMBOLS.map((symbol, i) => {
        const size = 18 + (i % 3) * 8;
        const left = 5 + (i * 12.5) % 90;
        const top = 10 + ((i * 37) % 80);
        const delay = i * 2.5;
        const duration = 12 + (i % 4) * 4;
        return (
          <span
            key={i}
            className="absolute select-none"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              fontSize: `${size}px`,
              opacity: 0,
              animation: `login-symbol-float ${duration}s ease-in-out ${delay}s infinite`,
              color: 'var(--color-text-muted)',
            }}
          >
            {symbol}
          </span>
        );
      })}
    </div>
  );
}

/* ── Keyframe styles (injected once) ────────────────────────────────── */

const animStyles = `
@keyframes login-float-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(60px, -50px) scale(1.15); }
  50% { transform: translate(-30px, 40px) scale(0.9); }
  75% { transform: translate(40px, 20px) scale(1.1); }
}
@keyframes login-float-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 60px) scale(1.2); }
  50% { transform: translate(40px, -30px) scale(0.85); }
  75% { transform: translate(-20px, -40px) scale(1.05); }
}
@keyframes login-float-3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(50px, 50px) scale(1.2); }
  66% { transform: translate(-40px, -30px) scale(0.9); }
}
@keyframes login-fade-up {
  from { opacity: 0; transform: translateY(30px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes login-logo-enter {
  0% { opacity: 0; transform: scale(0.3) rotate(-15deg); }
  50% { transform: scale(1.15) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes login-pulse-ring {
  0% { transform: scale(1); opacity: 0.7; }
  50% { opacity: 0.3; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes login-pulse-ring-2 {
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(2.8); opacity: 0; }
}
@keyframes login-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes login-gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes login-border-rotate {
  0% { --angle: 0deg; }
  100% { --angle: 360deg; }
}
@keyframes login-symbol-float {
  0% { opacity: 0; transform: translateY(20px) rotate(0deg); }
  15% { opacity: 0.15; }
  50% { opacity: 0.2; transform: translateY(-30px) rotate(10deg); }
  85% { opacity: 0.15; }
  100% { opacity: 0; transform: translateY(20px) rotate(-5deg); }
}
@keyframes login-card-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(37,99,235,0.08), 0 0 60px rgba(37,99,235,0.04); }
  50% { box-shadow: 0 0 30px rgba(37,99,235,0.15), 0 0 80px rgba(37,99,235,0.08); }
}
@keyframes login-bg-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
`;

/* ── LoginPage component ────────────────────────────────────────────── */

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
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

  return (
    <>
      <style>{animStyles}</style>

      <div
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
      >
        {/* Animated mesh canvas — captures mouse */}
        <MeshBackground />

        {/* Floating gradient orbs — MUCH bolder */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
          <div
            className="absolute rounded-full"
            style={{
              width: '600px',
              height: '600px',
              top: '-15%',
              right: '-8%',
              background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0.08) 50%, transparent 70%)',
              animation: 'login-float-1 14s ease-in-out infinite, login-bg-pulse 4s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '550px',
              height: '550px',
              bottom: '-15%',
              left: '-10%',
              background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, rgba(99,102,241,0.06) 50%, transparent 70%)',
              animation: 'login-float-2 18s ease-in-out infinite, login-bg-pulse 5s ease-in-out 1s infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '400px',
              height: '400px',
              top: '30%',
              left: '55%',
              background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 50%, transparent 70%)',
              animation: 'login-float-3 12s ease-in-out infinite, login-bg-pulse 6s ease-in-out 2s infinite',
            }}
          />
          {/* Extra orb — purple accent */}
          <div
            className="absolute rounded-full"
            style={{
              width: '350px',
              height: '350px',
              top: '60%',
              right: '20%',
              background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, rgba(168,85,247,0.04) 50%, transparent 70%)',
              animation: 'login-float-1 16s ease-in-out 3s infinite',
            }}
          />
        </div>

        {/* Floating financial symbols */}
        <FloatingSymbols />

        {/* Content */}
        <div className="relative w-full max-w-[420px] mx-4" style={{ zIndex: 2 }}>

          {/* Logo */}
          <div
            className="text-center mb-8"
            style={{
              animation: mounted ? 'login-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) both' : 'none',
              opacity: mounted ? undefined : 0,
            }}
          >
            <div className="relative inline-flex mb-5">
              {/* Double pulse rings */}
              <div
                className="absolute inset-[-8px] rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.4), rgba(59,130,246,0.2))',
                  animation: 'login-pulse-ring 2s ease-out infinite',
                }}
              />
              <div
                className="absolute inset-[-4px] rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.15))',
                  animation: 'login-pulse-ring-2 2.5s ease-out 0.5s infinite',
                }}
              />
              <div
                className="relative inline-flex items-center justify-center w-28 h-28 rounded-2xl overflow-hidden"
                style={{
                  animation: 'login-logo-enter 1s cubic-bezier(0.34,1.56,0.64,1) 0.15s both',
                }}
              >
                <img src="/pwa-512x512.png" alt="Simple ERP" className="w-full h-full object-contain" />
              </div>
            </div>
            <h1
              className="text-[30px] font-bold tracking-tight"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Masuk ke Simple ERP
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Sistem ERP Keuangan & Operasional
            </p>
          </div>

          {/* Card with animated glow border */}
          <div
            className="rounded-2xl p-7 ring-1 backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-bg-primary) 80%, transparent)',
              '--tw-ring-color': 'var(--color-border)',
              animation: mounted
                ? 'login-fade-up 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s both, login-card-glow 4s ease-in-out 1s infinite'
                : 'none',
              opacity: mounted ? undefined : 0,
              boxShadow: '0 25px 50px rgba(0,0,0,0.08), 0 0 30px rgba(37,99,235,0.06)',
            } as React.CSSProperties}
          >
            {error && (
              <div className="mb-5 p-3.5 rounded-xl flex items-start gap-3 text-sm bg-red-50 border border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800/50 dark:text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div
                style={{
                  animation: mounted ? 'login-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 0.25s both' : 'none',
                  opacity: mounted ? undefined : 0,
                }}
              >
                <label
                  htmlFor="login-email"
                  className="block text-[13px] font-medium mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Email
                </label>
                <div className="relative group">
                  <User
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors group-focus-within:text-blue-500"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <input
                    id="login-email"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-xl py-3 pl-11 pr-4 text-sm transition-all outline-none ring-1 focus:ring-2 focus:ring-blue-500 focus:shadow-lg focus:shadow-blue-500/20"
                    style={{
                      backgroundColor: 'var(--color-input-bg)',
                      color: 'var(--color-text-primary)',
                      '--tw-ring-color': 'var(--color-border)',
                    } as React.CSSProperties}
                    placeholder="nama@perusahaan.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div
                style={{
                  animation: mounted ? 'login-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 0.35s both' : 'none',
                  opacity: mounted ? undefined : 0,
                }}
              >
                <label
                  htmlFor="login-password"
                  className="block text-[13px] font-medium mb-2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Password
                </label>
                <div className="relative group">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors group-focus-within:text-blue-500"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-xl py-3 pl-11 pr-12 text-sm transition-all outline-none ring-1 focus:ring-2 focus:ring-blue-500 focus:shadow-lg focus:shadow-blue-500/20"
                    style={{
                      backgroundColor: 'var(--color-input-bg)',
                      color: 'var(--color-text-primary)',
                      '--tw-ring-color': 'var(--color-border)',
                    } as React.CSSProperties}
                    placeholder="Masukkan password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: 'var(--color-text-muted)' }}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div
                style={{
                  animation: mounted ? 'login-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 0.45s both' : 'none',
                  opacity: mounted ? undefined : 0,
                }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full overflow-hidden text-white font-semibold py-3.5 rounded-xl text-sm active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #3b82f6 100%)',
                    backgroundSize: '200% 200%',
                    animation: 'login-gradient-shift 3s ease-in-out infinite',
                    boxShadow: '0 8px 24px rgba(37,99,235,0.35), 0 2px 8px rgba(124,58,237,0.2)',
                  }}
                >
                  {/* Shimmer overlay — bolder */}
                  {!loading && (
                    <span
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                        animation: 'login-shimmer 2.5s ease-in-out infinite',
                      }}
                    />
                  )}
                  <span className="relative">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Memproses...
                      </span>
                    ) : (
                      'Masuk'
                    )}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div
            className="mt-6 text-center space-y-3"
            style={{
              animation: mounted ? 'login-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 0.55s both' : 'none',
              opacity: mounted ? undefined : 0,
            }}
          >
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Lupa password?{' '}
              <span className="font-medium cursor-default" style={{ color: 'var(--color-text-secondary)' }}>
                Hubungi Administrator
              </span>
            </p>
            <div className="flex items-center justify-center gap-2">
              <span
                className="text-xs font-mono rounded-md px-2 py-0.5 backdrop-blur-sm"
                style={{
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent)',
                  border: '1px solid var(--color-border)',
                }}
              >
                v{APP_VERSION}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                build {APP_BUILD_DATE}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
