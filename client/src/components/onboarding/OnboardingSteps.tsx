import { Building2, CalendarRange, CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/field';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { STEPS, type FiscalYearLite } from './onboarding-state';

export interface CompanyForm {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
}

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Numbered progress list; the current step carries aria-current="step". */
export function Stepper({ current }: { current: number }) {
  return (
    <ol aria-label="Langkah penyiapan" className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.id} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn('h-1 rounded-sm transition-colors', done || active ? 'bg-primary' : 'bg-border')}
            />
            <span
              className={cn(
                'hidden truncate text-xs sm:block',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="sr-only">{done ? 'Selesai: ' : active ? 'Langkah saat ini: ' : ''}</span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({ icon: Icon, children }: { icon: typeof Building2; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function WelcomeStep() {
  const tasks = [
    { icon: Building2, text: 'Profil perusahaan untuk kop faktur dan dokumen' },
    { icon: CalendarRange, text: 'Tahun buku yang aktif' },
    { icon: KeyRound, text: 'Kata sandi akun admin' },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sebelum tim mulai mencatat transaksi, siapkan beberapa hal dasar ini. Semua bisa diubah lagi nanti di
        Pengaturan, dan langkah yang dilewati tetap muncul sebagai daftar di Dasbor.
      </p>
      <ul className="space-y-2">
        {tasks.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm text-foreground">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
              <Icon className="size-4" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompanyStep({
  form,
  onChange,
  error,
}: {
  form: CompanyForm;
  onChange: (next: CompanyForm) => void;
  error?: string;
}) {
  const set = (key: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <Field label="Nama perusahaan" required hint="Nama resmi, mis. PT Maju Bersama." error={error}>
        <Input value={form.companyName} onChange={set('companyName')} autoComplete="organization" />
      </Field>
      <Field label="Alamat" hint="Dicetak di kop faktur dan surat jalan.">
        <Textarea value={form.address} onChange={set('address')} rows={2} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Telepon">
          <Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
      </div>
      <Field label="NPWP" hint="Opsional, bisa diisi nanti. 15 atau 16 digit.">
        <Input value={form.taxId} onChange={set('taxId')} inputMode="numeric" />
      </Field>
    </div>
  );
}

export function FiscalStep({ years, loading }: { years: FiscalYearLite[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat tahun buku…
      </div>
    );
  }
  if (!years?.length) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center">
          <CalendarRange className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">Belum ada tahun buku</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buat tahun buku di Pengaturan › Tahun Buku setelah penyiapan ini selesai.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <StepIntro icon={CalendarRange}>
        Transaksi hanya bisa dicatat di tahun buku yang terbuka. Tahun buku baru dan tutup buku diatur di
        Pengaturan › Tahun Buku.
      </StepIntro>
      <ul className="space-y-2">
        {years.map((fy) => (
          <li key={fy.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Tahun buku {fy.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatDateRange(fy.startDate, fy.endDate)}
              </p>
            </div>
            <StatusBadge label={fy.isClosed ? 'Ditutup' : 'Terbuka'} tone={fy.isClosed ? 'neutral' : 'success'} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SecurityStep({
  form,
  onChange,
  error,
}: {
  form: PasswordForm;
  onChange: (next: PasswordForm) => void;
  error?: string;
}) {
  const set = (key: keyof PasswordForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...form, [key]: e.target.value });
  return (
    <div className="space-y-4">
      <StepIntro icon={ShieldCheck}>
        Setelah kata sandi diganti, Anda akan diminta masuk lagi dengan kata sandi baru. Kosongkan semua kolom
        jika tidak ingin menggantinya sekarang.
      </StepIntro>
      <Field label="Kata sandi saat ini">
        <Input type="password" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
      </Field>
      <Field label="Kata sandi baru" hint="Minimal 8 karakter, dengan huruf besar, angka, dan karakter khusus." error={error}>
        <Input type="password" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
      </Field>
      <Field label="Ulangi kata sandi baru">
        <Input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" />
      </Field>
    </div>
  );
}

export function DoneStep({ companyName }: { companyName: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
        <CheckCircle2 className="size-7" aria-hidden />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        {companyName ? `${companyName} siap digunakan.` : 'Entaris siap digunakan.'} Langkah yang belum lengkap
        tampil sebagai daftar <span className="font-medium text-foreground">Lengkapi penyiapan</span> di Dasbor.
      </p>
    </div>
  );
}
