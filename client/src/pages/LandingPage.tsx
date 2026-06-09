import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight, LogIn, Mail, MessageCircle, Check, Sparkles,
  BookOpen, Boxes, Factory, Truck, ClipboardCheck, BarChart3,
  ShieldCheck, Layers, Rocket, Wallet, Receipt, Banknote, Landmark,
  Package, TrendingUp, Cpu, FileText,
} from 'lucide-react';

// ── Landing publik produk Simple ERP by PT Arah Karya Sinergi (AKS) ──────────
// Route /welcome (pola Artani). User login → redirect ke /. Self-contained:
// keyframes di-embed via <style>, warna brand AKS via arbitrary Tailwind.

const AKS = {
  product: 'Simple ERP',
  vendor: 'PT Arah Karya Sinergi',
  tagline: 'Presisi Arsitektural untuk Solusi Digital',
  email: 'solutions@arahkarya.com',
  whatsapp: '6281234567890', // ganti dengan nomor resmi AKS
  domain: 'arahkarya.com',
};
const waLink = `https://wa.me/${AKS.whatsapp}?text=${encodeURIComponent(
  'Halo AKS, saya tertarik dengan Simple ERP untuk bisnis saya.',
)}`;

const FEATURES = [
  { icon: BookOpen, title: 'Akuntansi Double-Entry', desc: 'Buku besar, jurnal, neraca & laba-rugi otomatis. Setiap transaksi langsung terposting ke COA.', tint: 'bg-blue-100 text-blue-700' },
  { icon: Boxes, title: 'Persediaan Multi-Gudang', desc: 'Stok per gudang, per batch (FIFO), HPP rata-rata tertimbang, transfer & opname.', tint: 'bg-teal-100 text-teal-700' },
  { icon: Factory, title: 'Produksi & Rendemen', desc: 'Catat input-output produksi, biaya konversi, dan yield — pas untuk manufaktur & penggilingan.', tint: 'bg-amber-100 text-amber-700' },
  { icon: Truck, title: 'Pembelian & Penjualan', desc: 'Alur PO → penerimaan → invoice, surat jalan, retur, dan uang muka vendor/pelanggan.', tint: 'bg-violet-100 text-violet-700' },
  { icon: ClipboardCheck, title: 'Approval Berlapis', desc: 'Pengajuan butuh persetujuan manajer — bisa diputuskan langsung dari Telegram.', tint: 'bg-rose-100 text-rose-700' },
  { icon: BarChart3, title: 'Laporan & Dashboard', desc: 'Neraca, arus kas, laba-rugi, aging piutang/hutang, dan dashboard operasional real-time.', tint: 'bg-sky-100 text-sky-700' },
];

const STEPS = [
  { icon: Package, title: 'Catat transaksi', desc: 'Input penjualan, pembelian, produksi, dan kas/bank lewat form yang ringkas — stok & jurnal terbentuk otomatis.' },
  { icon: ShieldCheck, title: 'Kontrol & setujui', desc: 'Hak akses per peran (RBAC), pengajuan disetujui manajer dari aplikasi atau langsung dari Telegram.' },
  { icon: TrendingUp, title: 'Lihat hasilnya', desc: 'Laporan keuangan & operasional ter-update real-time — ambil keputusan dari angka yang akurat.' },
];

const TRUST = [
  { icon: BookOpen, label: 'Double-Entry' },
  { icon: Boxes, label: 'Multi-Gudang' },
  { icon: ShieldCheck, label: 'RBAC + Audit' },
  { icon: MessageCircle, label: 'Approval Telegram' },
  { icon: FileText, label: 'Ekspor PDF & Excel' },
  { icon: Cpu, label: 'Multi-Perusahaan' },
];

const SECTORS = ['Penggilingan Padi', 'Pelet Biomassa', 'Trading & Distribusi', 'Manufaktur', 'Pangan', 'UKM'];

const PRINCIPLES = [
  { icon: Layers, title: 'Integritas Struktural', desc: 'Arsitektur berlapis — stabil saat beban puncak & transaksi data kompleks.' },
  { icon: ShieldCheck, title: 'Keamanan Enterprise', desc: 'Hak akses berbasis peran (RBAC) yang bisa diatur, jejak audit di setiap aksi.' },
  { icon: Rocket, title: 'Siap Tumbuh', desc: 'Modular & multi-instance — dipakai nyata di pabrik pangan, pelet biomassa, dan trading.' },
];

function useCounter(target: number, duration = 1400): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setV(Math.round((1 - Math.pow(1 - t, 3)) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: '0px 0px -70px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(26px)', transition: 'opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)', transitionDelay: `${delay}ms` }}>{children}</div>;
}

function AksLogo({ size = 32, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill={light ? '#ffffff' : '#002046'} />
      <path d="M32 14 L48 50 H40.5 L32 30 L23.5 50 H16 Z" fill={light ? '#002046' : '#a8c8ff'} />
      <path d="M32 14 L48 50 H40.5 L32 30 Z" fill={light ? '#00356c' : '#8cf3f3'} />
    </svg>
  );
}

interface Particle { id: number; left: number; size: number; duration: number; delay: number; color: string; ring: boolean; }
interface Floater { id: number; Icon: typeof Wallet; top: string; left: string; size: number; duration: number; delay: number; tint: string; }

export default function LandingPage() {
  if (typeof window !== 'undefined' && localStorage.getItem('user')) {
    return <Navigate to="/" replace />;
  }

  const modul = useCounter(40, 1200);
  const sektor = useCounter(6, 1000);
  const akurasi = useCounter(100, 1600);

  const particles: Particle[] = useMemo(() => {
    const palette = ['rgba(255,255,255,0.35)', 'rgba(168,200,255,0.45)', 'rgba(140,243,243,0.4)', 'rgba(96,159,252,0.4)'];
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i, left: Math.random() * 100, size: 3 + Math.random() * 6,
      duration: 12 + Math.random() * 14, delay: -Math.random() * 16,
      color: palette[Math.floor(Math.random() * palette.length)]!, ring: Math.random() > 0.75,
    }));
  }, []);

  const floaters: Floater[] = useMemo(() => {
    const icons: typeof Wallet[] = [Wallet, Receipt, Banknote, Landmark, Boxes, BarChart3, FileText, Package];
    return Array.from({ length: 10 }).map((_, i) => ({
      id: i, Icon: icons[i % icons.length]!,
      top: `${6 + Math.random() * 78}%`, left: `${4 + Math.random() * 90}%`,
      size: 26 + Math.random() * 30, duration: 5 + Math.random() * 7, delay: -Math.random() * 6,
      tint: ['text-white/10', 'text-white/[0.12]', 'text-[#a8c8ff]/20', 'text-[#8cf3f3]/15'][i % 4]!,
    }));
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f9fe] text-[#181c20]">
      <style>{LP_CSS}</style>

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#001533]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#top" className="flex items-center gap-2.5">
            <AksLogo size={30} />
            <span className="text-base font-extrabold tracking-tight text-white">{AKS.product} <span className="text-[#a8c8ff]">by AKS</span></span>
          </a>
          <div className="flex items-center gap-3">
            <a href="#fitur" className="hidden text-sm font-medium text-blue-100/80 transition-colors hover:text-white sm:block">Fitur</a>
            <a href="#cara-kerja" className="hidden text-sm font-medium text-blue-100/80 transition-colors hover:text-white sm:block">Cara Kerja</a>
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-transform hover:-translate-y-0.5">
              <LogIn size={15} /> Masuk
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section
        id="top"
        className="lpw-gradient relative overflow-hidden px-5 pt-32 pb-24 text-white md:pt-40"
        style={{ backgroundImage: 'linear-gradient(135deg, #001533 0%, #002046 30%, #00356c 55%, #013a6b 75%, #024a5a 100%)', backgroundSize: '300% 300%' }}
      >
        {/* conic halo */}
        <div aria-hidden className="lpw-spin pointer-events-none absolute -left-1/3 -top-1/3 h-[140%] w-[140%] opacity-40" style={{ background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.06) 60deg, transparent 120deg, rgba(255,255,255,0.06) 200deg, transparent 260deg, rgba(255,255,255,0.06) 320deg, transparent 360deg)' }} />
        {/* blueprint grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(96,159,252,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(96,159,252,.06) 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
        {/* particles */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {particles.map((p) => (
            <span key={p.id} className="lpw-drift absolute bottom-[-20px] rounded-full" style={{ left: `${p.left}%`, width: p.size, height: p.size, background: p.ring ? 'transparent' : p.color, border: p.ring ? `1px solid ${p.color}` : 'none', animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }} />
          ))}
        </div>
        {/* floating icons */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {floaters.map((f) => { const Icon = f.Icon; return (
            <Icon key={f.id} className={`lpw-bob absolute ${f.tint}`} style={{ top: f.top, left: f.left, width: f.size, height: f.size, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }} />
          ); })}
        </div>
        {/* bottom wave */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 overflow-hidden">
          <svg className="lpw-wave absolute inset-x-0 bottom-0 h-full w-[200%]" viewBox="0 0 1440 120" preserveAspectRatio="none">
            <path d="M0,64 C240,96 480,32 720,64 C960,96 1200,32 1440,64 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.05)" />
            <path d="M0,80 C240,48 480,112 720,80 C960,48 1200,112 1440,80 L1440,120 L0,120 Z" fill="rgba(255,255,255,0.035)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-10 md:grid-cols-5">
            {/* copy */}
            <div className="md:col-span-3">
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold text-blue-100 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8cf3f3] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#8cf3f3]" /></span>
                  ERP untuk UKM, Manufaktur & Trading
                </span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="lpw-textgrad mt-6 max-w-2xl text-4xl font-extrabold leading-[1.07] tracking-tight md:text-6xl">
                  Operasional & keuangan bisnis, dalam satu sistem.
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
                  {AKS.product} menyatukan akuntansi, persediaan, produksi, pembelian, dan penjualan —
                  dengan pembukuan double-entry yang akurat dan approval berlapis. Dibangun oleh {AKS.vendor}.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link to="/login" className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-[#002046] shadow-xl shadow-black/20 transition-transform hover:-translate-y-0.5">
                    Masuk ke Aplikasi <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border-2 border-white/25 px-6 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/10">
                    <MessageCircle size={16} /> Konsultasi Gratis
                  </a>
                </div>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-9 grid max-w-md grid-cols-3 gap-3">
                  {[{ l: 'Modul', v: `${modul}+` }, { l: 'Sektor', v: `${sektor}` }, { l: 'Akurasi %', v: `${akurasi}` }].map((s) => (
                    <div key={s.l} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                      <p className="text-2xl font-extrabold tabular-nums leading-none">{s.v}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-white/70">{s.l}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* hero visual card */}
            <Reveal delay={200} className="md:col-span-2">
              <div className="relative mx-auto max-w-xs">
                <div className="relative aspect-square rounded-3xl bg-gradient-to-br from-white/20 to-white/5 p-8 shadow-2xl shadow-black/30 ring-1 ring-white/25 backdrop-blur-md">
                  {['0s', '0.8s', '1.6s', '2.4s'].map((d) => (
                    <span key={d} aria-hidden className="lpw-sonar absolute inset-8 rounded-2xl ring-2 ring-white/40" style={{ animationDelay: d }} />
                  ))}
                  <div className="lpw-pulse relative flex h-full w-full items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
                    <AksLogo size={92} />
                  </div>
                </div>
                <div className="lpw-bob absolute -right-3 -top-3 rotate-3 rounded-lg bg-white px-3 py-2 text-[#002046] shadow-lg">
                  <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><div><p className="text-[10px] uppercase tracking-wider opacity-60">Laba Bersih</p><p className="text-sm font-bold">+18%</p></div></div>
                </div>
                <div className="lpw-bob absolute -bottom-3 -left-3 -rotate-2 rounded-lg bg-white px-3 py-2 text-[#002046] shadow-lg" style={{ animationDelay: '1s' }}>
                  <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-teal-600" /><div><p className="text-[10px] uppercase tracking-wider opacity-60">Stok Gudang</p><p className="text-sm font-bold">12 lokasi</p></div></div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-[#c4c6cf]/40 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-6 text-[#43474e]">
          {TRUST.map((t) => (
            <span key={t.label} className="inline-flex items-center gap-2 text-sm font-medium"><t.icon size={16} className="text-[#002046]" /> {t.label}</span>
          ))}
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="bg-[#f1f4f9] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#002046]/60">Fitur</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold text-[#181c20] md:text-4xl">Semua modul yang bisnis Anda butuhkan</h2>
            <p className="mt-4 max-w-2xl text-[#43474e]">Satu platform terintegrasi — dari transaksi harian sampai laporan keuangan, tanpa pindah-pindah aplikasi.</p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <div className="group h-full rounded-2xl border border-[#c4c6cf]/40 bg-white p-7 shadow-[0_10px_30px_rgba(24,28,32,0.03)] transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(24,28,32,0.08)]">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${f.tint}`}><f.icon size={22} /></div>
                  <h3 className="mt-5 text-xl font-bold text-[#181c20]">{f.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#43474e]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="bg-[#f7f9fe] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#002046]/60">Cara Kerja</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold text-[#181c20] md:text-4xl">Tiga langkah, langsung jalan</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <div className="relative h-full rounded-2xl border border-[#c4c6cf]/40 bg-white p-7">
                  <span className="absolute right-6 top-5 text-5xl font-extrabold text-[#002046]/5">{i + 1}</span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#d6e3ff] text-[#002046]"><s.icon size={22} /></div>
                  <h3 className="mt-5 text-xl font-bold text-[#181c20]">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#43474e]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <div className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-sm font-semibold text-[#43474e]"><Sparkles size={14} className="mr-1 inline" /> Dipakai di sektor:</span>
              {SECTORS.map((s) => (
                <span key={s} className="rounded-full bg-[#ebeef3] px-3 py-1 text-xs font-medium text-[#43474e]">{s}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Prinsip / kenapa */}
      <section className="bg-[#f1f4f9] py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#002046]/60">Kenapa Kami</p>
              <h2 className="mt-3 text-3xl font-extrabold text-[#181c20] md:text-4xl">Dibangun di atas prinsip presisi</h2>
              <p className="mt-4 text-[#43474e]">{AKS.vendor} merancang sistem yang stabil, aman, dan siap tumbuh bersama bisnis Anda.</p>
              <div className="mt-6 h-1.5 w-24 rounded-full bg-gradient-to-r from-[#002046] to-[#8cf3f3]" />
            </div>
          </Reveal>
          <div className="space-y-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className="group flex gap-5 rounded-2xl p-6 transition-colors hover:bg-white">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c4c6cf]/40 bg-white text-[#002046] transition-colors group-hover:bg-[#002046] group-hover:text-white"><p.icon size={20} /></div>
                  <div><h3 className="text-lg font-bold text-[#181c20]">{p.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-[#43474e]">{p.desc}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lpw-gradient relative overflow-hidden py-20 text-white md:py-28" style={{ backgroundImage: 'linear-gradient(135deg, #001533 0%, #002046 50%, #00356c 100%)', backgroundSize: '300% 300%' }}>
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="relative mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold md:text-5xl">Siap merapikan operasional bisnis Anda?</h2>
            <p className="mx-auto mt-5 max-w-xl text-white/85">Sudah punya akun? Masuk sekarang. Belum? Hubungi {AKS.vendor} untuk demo & implementasi.</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-7 flex max-w-md flex-col gap-2.5 text-left">
              {['Implementasi & migrasi data didampingi', 'Pelatihan tim Anda', 'Kode & data sepenuhnya milik Anda'].map((t) => (
                <div key={t} className="flex items-center gap-3 text-sm text-white/90"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8cf3f3]/20 text-[#8cf3f3]"><Check size={12} /></span>{t}</div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-sm font-bold text-[#002046] shadow-xl shadow-black/20 transition-transform hover:-translate-y-0.5"><LogIn size={16} /> Masuk ke Aplikasi</Link>
              <a href={`mailto:${AKS.email}`} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/25 px-7 py-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/10"><Mail size={16} /> {AKS.email}</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#ebeef3]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <AksLogo size={28} />
            <div><div className="text-sm font-extrabold text-[#181c20]">{AKS.vendor}</div><div className="text-xs text-[#43474e]">{AKS.tagline}</div></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#43474e]"><Banknote size={13} /> {AKS.product} · © {new Date().getFullYear()} · {AKS.domain}</div>
        </div>
      </footer>
    </div>
  );
}

const LP_CSS = `
@keyframes lpw-gradient { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
@keyframes lpw-drift { 0%{transform:translateY(0) translateX(0);opacity:0} 10%{opacity:.85} 90%{opacity:.85} 100%{transform:translateY(-110vh) translateX(40px);opacity:0} }
@keyframes lpw-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes lpw-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes lpw-wave { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes lpw-sonar { 0%{transform:scale(1);opacity:.6} 80%{opacity:0} 100%{transform:scale(2.3);opacity:0} }
@keyframes lpw-pulse { 0%,100%{transform:scale(1);filter:drop-shadow(0 0 0 rgba(255,255,255,0))} 50%{transform:scale(1.05);filter:drop-shadow(0 0 14px rgba(140,243,243,.4))} }
@keyframes lpw-textgrad { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
.lpw-gradient{animation:lpw-gradient 16s ease infinite}
.lpw-drift{animation:lpw-drift linear infinite}
.lpw-bob{animation:lpw-bob 2.6s ease-in-out infinite}
.lpw-spin{animation:lpw-spin 30s linear infinite}
.lpw-wave{animation:lpw-wave 20s linear infinite}
.lpw-sonar{animation:lpw-sonar 3s ease-out infinite}
.lpw-pulse{animation:lpw-pulse 3.5s ease-in-out infinite}
.lpw-textgrad{background-image:linear-gradient(120deg,#ffffff 0%,#d6e3ff 40%,#a8c8ff 60%,#8cf3f3 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lpw-textgrad 6s ease infinite}
@media (prefers-reduced-motion: reduce){.lpw-gradient,.lpw-drift,.lpw-bob,.lpw-spin,.lpw-wave,.lpw-sonar,.lpw-pulse,.lpw-textgrad{animation:none}.lpw-textgrad{color:#fff}}
`;
