import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight, BookOpen, Boxes, Factory, ClipboardCheck, BarChart3, ShieldCheck,
  Layers, Rocket, Mail, MessageCircle, LogIn, Check, Banknote, Truck,
} from 'lucide-react';

// Landing publik produk Simple ERP (oleh PT Arah Karya Sinergi / AKS).
// Route /welcome — pola seperti LandingPage Artani. User yang sudah login
// dialihkan ke aplikasi (/). Self-contained: warna brand AKS via arbitrary
// Tailwind, ikon lucide. Tidak mengubah routing app yang ada.

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

const PRINCIPLES = [
  { icon: Layers, title: 'Integritas Struktural', desc: 'Arsitektur berlapis — stabil saat beban puncak & transaksi data kompleks.' },
  { icon: ShieldCheck, title: 'Keamanan Enterprise', desc: 'Hak akses berbasis peran (RBAC) yang bisa diatur, jejak audit di setiap aksi.' },
  { icon: Rocket, title: 'Siap Tumbuh', desc: 'Modular & multi-instance — dipakai nyata di pabrik pangan, pelet biomassa, dan trading.' },
];

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVis(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? 'none' : 'translateY(24px)',
        transition: 'opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
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

export default function LandingPage() {
  // User sudah login → langsung ke aplikasi.
  if (typeof window !== 'undefined' && localStorage.getItem('user')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#f7f9fe] text-[#181c20]">
      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#001533]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#top" className="flex items-center gap-2.5">
            <AksLogo size={30} />
            <span className="text-base font-extrabold tracking-tight text-white">
              {AKS.product} <span className="text-[#a8c8ff]">by AKS</span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <a href="#fitur" className="hidden text-sm font-medium text-blue-100/80 transition-colors hover:text-white sm:block">Fitur</a>
            <a href="#kenapa" className="hidden text-sm font-medium text-blue-100/80 transition-colors hover:text-white sm:block">Kenapa Kami</a>
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-colors hover:bg-blue-400">
              <LogIn size={15} /> Masuk
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden bg-[#001533] text-white">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(rgba(96,159,252,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(96,159,252,.06) 1px,transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-[#8cf3f3]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-36 md:pt-44">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-blue-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8cf3f3]" />
              ERP untuk UKM, Manufaktur & Trading
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] text-white md:text-6xl">
              Operasional & keuangan bisnis,{' '}
              <span className="bg-gradient-to-r from-blue-300 to-[#8cf3f3] bg-clip-text text-transparent">
                dalam satu sistem.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-blue-100/80 md:text-lg">
              {AKS.product} menyatukan akuntansi, persediaan, produksi, pembelian, dan penjualan —
              dengan pembukuan double-entry yang akurat dan approval berlapis. Dibangun oleh{' '}
              {AKS.vendor}.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-7 py-4 text-sm font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-colors hover:bg-blue-400">
                Masuk ke Aplikasi <ArrowRight size={16} />
              </Link>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20">
                <MessageCircle size={16} /> Konsultasi Gratis
              </a>
            </div>
          </Reveal>
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#d6e3ff] text-[#002046] transition-colors group-hover:bg-[#002046] group-hover:text-white">
                    <f.icon size={22} />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-[#181c20]">{f.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#43474e]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Kenapa */}
      <section id="kenapa" className="bg-[#f7f9fe] py-20 md:py-28">
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c4c6cf]/40 bg-white text-[#002046] transition-colors group-hover:bg-[#002046] group-hover:text-white">
                    <p.icon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#181c20]">{p.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#43474e]">{p.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-[#001533] py-20 text-white md:py-28">
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="relative mx-auto max-w-4xl px-5 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold text-white md:text-5xl">Siap merapikan operasional bisnis Anda?</h2>
            <p className="mx-auto mt-5 max-w-xl text-blue-100/80">Sudah punya akun? Masuk sekarang. Belum? Hubungi {AKS.vendor} untuk demo & implementasi.</p>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto mt-7 flex max-w-md flex-col gap-2.5 text-left">
              {['Implementasi & migrasi data didampingi', 'Pelatihan tim Anda', 'Kode & data sepenuhnya milik Anda'].map((t) => (
                <div key={t} className="flex items-center gap-3 text-sm text-blue-100/90">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8cf3f3]/20 text-[#8cf3f3]"><Check size={12} /></span>
                  {t}
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-7 py-4 text-sm font-bold text-white shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-colors hover:bg-blue-400">
                <LogIn size={16} /> Masuk ke Aplikasi
              </Link>
              <a href={`mailto:${AKS.email}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 py-4 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20">
                <Mail size={16} /> {AKS.email}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#ebeef3]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-2.5">
            <AksLogo size={28} />
            <div>
              <div className="text-sm font-extrabold">{AKS.vendor}</div>
              <div className="text-xs text-[#43474e]">{AKS.tagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#43474e]">
            <Banknote size={13} /> {AKS.product} · © {new Date().getFullYear()} · {AKS.domain}
          </div>
        </div>
      </footer>
    </div>
  );
}
