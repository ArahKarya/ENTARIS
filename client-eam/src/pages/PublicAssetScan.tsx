import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Tag, Building2, QrCode, ShieldCheck, RotateCw, Package, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// PUBLIC page (no auth) — landing target for GA asset QR labels.
// Loads non-sensitive asset info via /api/ga/public/:qrCode.
// EAM copy of client/src/pages/PublicAssetScan.tsx. client-eam has no brand
// tokens/shared BrandMark yet (Phase 2.5 merge), so the mark, wordmark and
// status chips are self-contained here, with explicit dark: values.
interface PublicAsset {
  code: string;
  name: string;
  category: string | null;
  categoryCode: string | null;
  branch: string | null;
  status: string;
  condition: string;
  location: string | null;
  photos: { id: string; url: string; caption: string | null }[];
}

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

// Same values as client/src/index.css --{tone}-subtle / --{tone}-text (AA in both themes).
const TONE_CLASSES: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-[#EEF1F5] text-[#46546B] dark:bg-[#1D2A40] dark:text-[#B4C0D2]', dot: 'bg-current' },
  info: { chip: 'bg-[#E4F5F7] text-[#0B6470] dark:bg-[#0F2E33] dark:text-[#86D6E0]', dot: 'bg-current' },
  success: { chip: 'bg-[#E7F5EE] text-[#14663F] dark:bg-[#12301F] dark:text-[#7CD9AA]', dot: 'bg-current' },
  warning: { chip: 'bg-[#FDF3E1] text-[#7D5100] dark:bg-[#33270F] dark:text-[#F1C877]', dot: 'bg-current' },
  danger: { chip: 'bg-[#FCEBE9] text-[#9B2219] dark:bg-[#3A1A18] dark:text-[#F6A29B]', dot: 'bg-current' },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  IN_REPAIR: { label: 'Dalam Perbaikan', tone: 'warning' },
  RETIRED: { label: 'Dihentikan', tone: 'neutral' },
  LOST: { label: 'Hilang', tone: 'danger' },
};

const CONDITION: Record<string, { label: string; tone: Tone }> = {
  GOOD: { label: 'Baik', tone: 'success' },
  FAIR: { label: 'Cukup', tone: 'info' },
  POOR: { label: 'Kurang', tone: 'warning' },
  BROKEN: { label: 'Rusak', tone: 'danger' },
};

export default function PublicAssetScan() {
  const { qrCode } = useParams<{ qrCode: string }>();
  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/ga/public/${encodeURIComponent(qrCode ?? '')}`);
        if (res.status === 404) {
          if (alive) setState('not-found');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PublicAsset = await res.json();
        if (alive) {
          setAsset(data);
          setState('ready');
        }
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [qrCode, attempt]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-4">
          <EntarisWordmark />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <QrCode className="size-3.5" aria-hidden />
            Info Aset
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6" aria-busy={state === 'loading'}>
        {state === 'loading' && <AssetSkeleton />}

        {state === 'not-found' && (
          <StateMessage
            icon={QrCode}
            title="Aset tidak ditemukan"
            description="Kode QR ini tidak terdaftar atau sudah tidak aktif. Pastikan Anda memindai label yang benar, atau hubungi bagian GA."
          >
            {qrCode && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{qrCode}</p>}
          </StateMessage>
        )}

        {state === 'error' && (
          <StateMessage
            tone="danger"
            icon={AlertTriangle}
            title="Info aset gagal dimuat"
            description="Periksa koneksi internet Anda, lalu coba lagi."
          >
            <Button variant="outline" className="mt-5" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw aria-hidden /> Coba lagi
            </Button>
          </StateMessage>
        )}

        {state === 'ready' && asset && <AssetCard asset={asset} />}
      </main>

      <footer className="mx-auto w-full max-w-md px-4 pb-8 text-center text-xs text-balance text-muted-foreground">
        Halaman publik hasil pindai label aset. Hanya menampilkan informasi umum.
      </footer>
    </div>
  );
}

function AssetCard({ asset }: { asset: PublicAsset }) {
  const cond = CONDITION[asset.condition] ?? { label: asset.condition, tone: 'neutral' as Tone };
  const status = STATUS[asset.status] ?? { label: asset.status, tone: 'neutral' as Tone };
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="space-y-3 p-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Package className="size-3.5" aria-hidden />
          Aset perusahaan
        </p>
        <h1 className="font-heading text-xl font-semibold leading-snug text-foreground break-words">{asset.name}</h1>
        <p className="font-mono text-sm text-muted-foreground break-all">{asset.code}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Chip label={status.label} tone={status.tone} />
          <Chip label={`Kondisi: ${cond.label}`} tone={cond.tone} />
        </div>
      </div>

      <dl className="divide-y divide-border border-t border-border text-sm">
        <DetailRow icon={<Tag className="size-4" aria-hidden />} label="Kategori" value={asset.category} />
        <DetailRow icon={<Building2 className="size-4" aria-hidden />} label="Cabang" value={asset.branch} />
        <DetailRow icon={<MapPin className="size-4" aria-hidden />} label="Lokasi" value={asset.location} />
      </dl>

      {asset.photos.length > 0 && (
        <div className="border-t border-border p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Foto aset</h2>
          <ul className="grid grid-cols-2 gap-2">
            {asset.photos.map((p, i) => (
              <li key={p.id} className={asset.photos.length % 2 === 1 && i === 0 ? 'col-span-2' : undefined}>
                <img
                  src={p.url}
                  alt={p.caption ?? `Foto ${asset.name} ${i + 1}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-lg border border-border bg-muted object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-start gap-2 border-t border-border bg-muted/60 px-5 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-px size-4 shrink-0 text-[#14663F] dark:text-[#7CD9AA]" aria-hidden />
        <span>Data resmi dari sistem aset perusahaan. Hubungi bagian GA jika ada yang tidak sesuai.</span>
      </div>
    </article>
  );
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium text-foreground break-words">{value || '—'}</dd>
    </div>
  );
}

function AssetSkeleton() {
  return (
    <div role="status" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <span className="sr-only">Memuat info aset…</span>
      <div className="space-y-3 p-5" aria-hidden>
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 animate-pulse rounded bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-4 border-t border-border p-5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Not-found / error message with a real <h1> (EmptyState renders its title as <p>). */
function StateMessage({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: 'neutral' | 'danger';
  children?: ReactNode;
}) {
  return (
    <section
      role={tone === 'danger' ? 'alert' : undefined}
      className="flex flex-col items-center rounded-xl border border-border bg-card px-5 py-10 text-center shadow-sm"
    >
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-xl',
          tone === 'danger' ? TONE_CLASSES.danger.chip : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-8" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="mt-4 font-heading text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

function Chip({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium leading-4',
        t.chip,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', t.dot)} aria-hidden />
      {label}
    </span>
  );
}

// Entaris "Anyaman ∇" mark — paths from docs/brand/entaris/entaris-mark*.svg.
const MARK_PATHS = [
  'M306.8 358.5L256.0 270.5L256.0 270.5L192.5 160.5L90.8 160.5L256.0 446.5Z',
  'M86.8 153.5L188.4 153.5L315.5 153.5L317.5 150.0L366.3 65.5L36.0 65.5Z',
  'M374.4 65.5L323.6 153.5L323.6 153.5L260.0 263.5L262.1 267.0L310.8 351.5L476.0 65.5Z',
] as const;

function Mark({ fills, className }: { fills: readonly [string, string, string]; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={20} height={20} aria-hidden focusable="false" className={className}>
      {MARK_PATHS.map((d, i) => (
        <path key={d} d={d} fill={fills[i]} />
      ))}
    </svg>
  );
}

/** ENTARIS wordmark + EAM chip; default mark in light theme, negative in dark. */
function EntarisWordmark() {
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label="Entaris EAM">
      <Mark fills={['#3D8BE0', '#1B2B48', '#2E5CA8']} className="shrink-0 dark:hidden" />
      <Mark fills={['#3D8BE0', '#FFFFFF', '#9CC9F5']} className="hidden shrink-0 dark:block" />
      <span className="flex items-center gap-1.5 leading-none" aria-hidden>
        <span className="font-heading text-sm font-extrabold uppercase tracking-[0.06em] text-[#1B2B48] dark:text-white">
          EN<span className="text-[#2E5CA8] dark:text-[#9CC9F5]">TA</span>RIS
        </span>
        <span className="rounded-sm border border-border px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          EAM
        </span>
      </span>
    </span>
  );
}
