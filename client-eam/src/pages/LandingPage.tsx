import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight, LogIn, Mail, MessageCircle, Check,
  BookOpen, Boxes, Factory, Truck, ClipboardCheck, BarChart3,
  ShieldCheck, Layers, Rocket, Search, Bell, LayoutDashboard,
  Wallet, TrendingUp, ChevronRight,
} from 'lucide-react';

// ── Landing publik produk Simple ERP by PT Arah Karya Sinergi (AKS) ──────────
// Route /welcome (pola Artani). User login → redirect ke /.
// Gaya: premium minimal (navy elegan, gerak ditahan) + mockup dashboard CSS.

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
  { icon: BookOpen, title: 'Akuntansi Double-Entry', desc: 'Buku besar, jurnal, neraca & laba-rugi otomatis. Setiap transaksi langsung terposting ke COA.' },
  { icon: Boxes, title: 'Persediaan Multi-Gudang', desc: 'Stok per gudang, per batch (FIFO), HPP rata-rata tertimbang, transfer & opname.' },
  { icon: Factory, title: 'Produksi & Rendemen', desc: 'Catat input-output produksi, biaya konversi, dan yield — pas untuk manufaktur & penggilingan.' },
  { icon: Truck, title: 'Pembelian & Penjualan', desc: 'Alur PO → penerimaan → invoice, surat jalan, retur, dan uang muka vendor/pelanggan.' },
  { icon: ClipboardCheck, title: 'Approval Berlapis', desc: 'Pengajuan butuh persetujuan manajer — bisa diputuskan langsung dari Telegram.' },
  { icon: BarChart3, title: 'Laporan & Dashboard', desc: 'Neraca, arus kas, laba-rugi, aging piutang/hutang, dan dashboard operasional real-time.' },
];

const STEPS = [
  { n: '01', title: 'Catat transaksi', desc: 'Input penjualan, pembelian, produksi, dan kas/bank lewat form ringkas — stok & jurnal terbentuk otomatis.' },
  { n: '02', title: 'Kontrol & setujui', desc: 'Hak akses per peran (RBAC), pengajuan disetujui manajer dari aplikasi atau langsung dari Telegram.' },
  { n: '03', title: 'Lihat hasilnya', desc: 'Laporan keuangan & operasional ter-update real-time — ambil keputusan dari angka yang akurat.' },
];

const SECTORS = ['Penggilingan Padi', 'Pelet Biomassa', 'Trading & Distribusi', 'Manufaktur', 'Pangan', 'UKM'];

const PRINCIPLES = [
  { icon: Layers, title: 'Integritas Struktural', desc: 'Arsitektur berlapis — stabil saat beban puncak & transaksi data kompleks.' },
  { icon: ShieldCheck, title: 'Keamanan Enterprise', desc: 'Hak akses berbasis peran (RBAC) yang bisa diatur, jejak audit di setiap aksi.' },
  { icon: Rocket, title: 'Siap Tumbuh', desc: 'Modular & multi-instance — dipakai nyata di pabrik pangan, pelet biomassa, dan trading.' },
];

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(22px)', transition: 'opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1)', transitionDelay: `${delay}ms` }}>{children}</div>;
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

// Mockup dashboard ERP (UI tiruan, bukan data nyata) — visual hero.
function DashboardMock() {
  const bars = [42, 60, 48, 72, 64, 88, 76];
  return (
    <div className="lpw-float relative w-full select-none">
      {/* window */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/40 ring-1 ring-white/15">
        {/* titlebar */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <div className="ml-3 flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] text-gray-400 ring-1 ring-gray-100">
            <Search size={10} /> erp.arahkarya.com
          </div>
        </div>
        <div className="flex">
          {/* sidebar */}
          <div className="hidden w-28 shrink-0 flex-col gap-1 border-r border-gray-100 bg-[#001533] p-3 sm:flex">
            <div className="mb-2 flex items-center gap-1.5"><AksLogo size={16} /><span className="text-[9px] font-bold text-white">Simple ERP</span></div>
            {[['Dashboard', true], ['Penjualan', false], ['Pembelian', false], ['Stok', false], ['Produksi', false], ['Laporan', false]].map(([l, active]) => (
              <div key={l as string} className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[9px] ${active ? 'bg-white/15 font-semibold text-white' : 'text-white/55'}`}>
                <span className={`h-1.5 w-1.5 rounded-sm ${active ? 'bg-[#8cf3f3]' : 'bg-white/30'}`} />{l}
              </div>
            ))}
          </div>
          {/* main */}
          <div className="flex-1 bg-[#f7f9fe] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#181c20]"><LayoutDashboard size={12} className="text-[#002046]" /> Dashboard</div>
              <div className="flex items-center gap-2 text-gray-300"><Bell size={12} /><span className="h-5 w-5 rounded-full bg-[#d6e3ff]" /></div>
            </div>
            {/* KPI */}
            <div className="grid grid-cols-3 gap-2">
              {[['Penjualan', 'Rp 11,2 M', 'text-[#002046]'], ['Laba Bersih', '+18%', 'text-emerald-600'], ['Stok Aktif', '12 gd', 'text-teal-600']].map(([l, v, c]) => (
                <div key={l} className="rounded-lg bg-white p-2 ring-1 ring-gray-100">
                  <p className="text-[7px] uppercase tracking-wide text-gray-400">{l}</p>
                  <p className={`mt-0.5 text-[11px] font-extrabold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            {/* chart */}
            <div className="mt-2 rounded-lg bg-white p-3 ring-1 ring-gray-100">
              <div className="flex items-center justify-between"><p className="text-[8px] font-semibold text-gray-500">Arus Kas 7 hari</p><span className="text-[7px] text-emerald-600">▲ 12%</span></div>
              <div className="mt-2 flex h-16 items-end gap-1.5">
                {bars.map((h, i) => (
                  <div key={i} className="lpw-bar flex-1 rounded-t bg-gradient-to-t from-[#002046] to-[#609ffc]" style={{ ['--h' as string]: `${h}%`, animationDelay: `${0.3 + i * 0.08}s` }} />
                ))}
              </div>
            </div>
            {/* rows */}
            <div className="mt-2 space-y-1">
              {[['INV-2026-0184', 'Lunas'], ['STT-2026-0210', 'Diterima'], ['PR-2026-0066', 'Selesai']].map(([d, s]) => (
                <div key={d} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 ring-1 ring-gray-100">
                  <span className="font-mono text-[8px] text-gray-500">{d}</span>
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[7px] font-medium text-emerald-600">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* floating badges */}
      <div className="lpw-bob absolute -right-4 top-10 hidden rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5 sm:block">
        <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /><div><p className="text-[8px] uppercase tracking-wide text-gray-400">Laba Bersih</p><p className="text-xs font-bold text-[#181c20]">+18,2%</p></div></div>
      </div>
      <div className="lpw-bob absolute -left-4 bottom-12 hidden rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5 sm:block" style={{ animationDelay: '1.1s' }}>
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#002046]" /><div><p className="text-[8px] uppercase tracking-wide text-gray-400">Approval</p><p className="text-xs font-bold text-[#181c20]">via Telegram</p></div></div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  if (typeof window !== 'undefined' && localStorage.getItem('user')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fe] text-[#181c20]">
      <style>{LP_CSS}</style>

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#001029]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#top" className="flex items-center gap-2.5">
            <AksLogo size={28} />
            <span className="text-[15px] font-extrabold tracking-tight text-white">{AKS.product} <span className="font-medium text-white/45">by AKS</span></span>
          </a>
          <div className="flex items-center gap-2 sm:gap-5">
            <a href="#fitur" className="hidden text-sm font-medium text-white/65 transition-colors hover:text-white sm:block">Fitur</a>
            <a href="#cara-kerja" className="hidden text-sm font-medium text-white/65 transition-colors hover:text-white sm:block">Cara Kerja</a>
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2 text-sm font-bold text-[#002046] transition-transform hover:-translate-y-0.5">
              <LogIn size={15} /> Masuk
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden bg-[#001029] px-5 pt-32 pb-20 text-white md:pt-40 md:pb-28">
        {/* soft glows + grid (ditahan, tidak ramai) */}
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#00356c]/50 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 top-20 h-[24rem] w-[24rem] rounded-full bg-[#0a4f6e]/40 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'linear-gradient(rgba(96,159,252,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(96,159,252,.05) 1px,transparent 1px)', backgroundSize: '52px 52px', maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)' }} />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8cf3f3] opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#8cf3f3]" /></span>
                ERP untuk UKM, Manufaktur & Trading
              </span>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-white md:text-[3.6rem]">
                Operasional & keuangan bisnis,
                <span className="block bg-gradient-to-r from-[#a8c8ff] to-[#8cf3f3] bg-clip-text text-transparent"> dalam satu sistem.</span>
              </h1>
            </Reveal>
            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 md:text-lg">
                {AKS.product} menyatukan akuntansi, persediaan, produksi, pembelian, dan penjualan —
                dengan pembukuan double-entry yang akurat dan approval berlapis. Dibangun oleh {AKS.vendor}.
              </p>
            </Reveal>
            <Reveal delay={230}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/login" className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#002046] shadow-lg shadow-black/30 transition-transform hover:-translate-y-0.5">
                  Masuk ke Aplikasi <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10">
                  <MessageCircle size={16} /> Konsultasi Gratis
                </a>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/45">
                <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-[#8cf3f3]" /> Double-entry akurat</span>
                <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-[#8cf3f3]" /> Multi-gudang & batch</span>
                <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-[#8cf3f3]" /> RBAC + audit</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={180}>
            <div className="relative">
              <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-[#609ffc]/20 to-[#8cf3f3]/10 blur-2xl" />
              <DashboardMock />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Sektor strip */}
      <section className="border-b border-[#c4c6cf]/40 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#43474e]/60">Dipercaya lintas sektor</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {SECTORS.map((s) => (
              <span key={s} className="text-sm font-semibold text-[#43474e]/70">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="bg-[#f7f9fe] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#002046]/55">Fitur</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-[#181c20] md:text-[2.6rem]">Semua modul yang bisnis Anda butuhkan</h2>
            <p className="mt-4 max-w-2xl text-[#43474e]">Satu platform terintegrasi — dari transaksi harian sampai laporan keuangan, tanpa pindah-pindah aplikasi.</p>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-[#c4c6cf]/30 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="group h-full bg-white p-7 transition-colors hover:bg-[#fbfcfe]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#001029] text-[#8cf3f3] transition-transform group-hover:-translate-y-0.5"><f.icon size={20} /></div>
                  <h3 className="mt-5 text-lg font-bold text-[#181c20]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#43474e]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="bg-[#001029] py-20 text-white md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8cf3f3]/70">Cara Kerja</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white md:text-[2.6rem]">Tiga langkah, langsung jalan</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <div className="relative h-full rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm">
                  <span className="bg-gradient-to-br from-[#a8c8ff] to-[#8cf3f3] bg-clip-text text-4xl font-extrabold text-transparent">{s.n}</span>
                  <h3 className="mt-4 text-lg font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Prinsip / kenapa */}
      <section className="bg-[#f7f9fe] py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Reveal>
            <div className="lg:sticky lg:top-28">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#002046]/55">Kenapa Kami</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#181c20] md:text-[2.6rem]">Dibangun di atas prinsip presisi</h2>
              <p className="mt-4 text-[#43474e]">{AKS.vendor} merancang sistem yang stabil, aman, dan siap tumbuh bersama bisnis Anda.</p>
              <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-[#002046] hover:gap-2.5 transition-all">Mulai sekarang <ChevronRight size={15} /></Link>
              <div className="mt-6 h-1.5 w-24 rounded-full bg-gradient-to-r from-[#002046] to-[#8cf3f3]" />
            </div>
          </Reveal>
          <div className="space-y-3">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className="group flex gap-5 rounded-2xl border border-transparent p-6 transition-all hover:border-[#c4c6cf]/40 hover:bg-white hover:shadow-[0_20px_40px_rgba(24,28,32,0.05)]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c4c6cf]/40 bg-white text-[#002046] transition-colors group-hover:bg-[#001029] group-hover:text-[#8cf3f3]"><p.icon size={20} /></div>
                  <div><h3 className="text-lg font-bold text-[#181c20]">{p.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-[#43474e]">{p.desc}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-[#001029] py-20 text-white md:py-28">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#609ffc]/20 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <AksLogo size={44} />
            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-extrabold tracking-tight text-white md:text-[3rem]">Siap merapikan operasional bisnis Anda?</h2>
            <p className="mx-auto mt-5 max-w-xl text-white/65">Sudah punya akun? Masuk sekarang. Belum? Hubungi {AKS.vendor} untuk demo & implementasi.</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-7 flex max-w-md flex-col gap-2.5 text-left">
              {['Implementasi & migrasi data didampingi', 'Pelatihan tim Anda', 'Kode & data sepenuhnya milik Anda'].map((t) => (
                <div key={t} className="flex items-center gap-3 text-sm text-white/85"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8cf3f3]/20 text-[#8cf3f3]"><Check size={12} /></span>{t}</div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-bold text-[#002046] shadow-lg shadow-black/30 transition-transform hover:-translate-y-0.5"><LogIn size={16} /> Masuk ke Aplikasi</Link>
              <a href={`mailto:${AKS.email}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-7 py-4 text-sm font-bold text-white transition-colors hover:bg-white/10"><Mail size={16} /> {AKS.email}</a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#000814] py-8 text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <AksLogo size={28} light />
            <div><div className="text-sm font-extrabold text-white">{AKS.vendor}</div><div className="text-xs text-white/45">{AKS.tagline}</div></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/45"><Wallet size={13} /> {AKS.product} · © {new Date().getFullYear()} · {AKS.domain}</div>
        </div>
      </footer>
    </div>
  );
}

const LP_CSS = `
@keyframes lpw-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
@keyframes lpw-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes lpw-bar { from{height:0} to{height:var(--h)} }
.lpw-float{animation:lpw-float 6s ease-in-out infinite}
.lpw-bob{animation:lpw-bob 3s ease-in-out infinite}
.lpw-bar{height:var(--h);animation:lpw-bar 1s cubic-bezier(.16,1,.3,1) both}
@media (prefers-reduced-motion: reduce){.lpw-float,.lpw-bob,.lpw-bar{animation:none}}
`;
