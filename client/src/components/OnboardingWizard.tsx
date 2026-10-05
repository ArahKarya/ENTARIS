import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrandMark } from '@/components/shared/brand-mark';
import {
  completeOnboarding,
  companyUpdatePayload,
  isLocallySuppressed,
  markDoneLocally,
  passwordProblem,
  realCompanyName,
  shouldShowWizard,
  STEPS,
  type FiscalYearLite,
  type StepId,
  type OnboardingCompany,
} from './onboarding/onboarding-state';
import {
  CompanyStep,
  DoneStep,
  FiscalStep,
  SecurityStep,
  Stepper,
  WelcomeStep,
  type CompanyForm,
  type PasswordForm,
} from './onboarding/OnboardingSteps';

interface OnboardingWizardProps {
  /** Called once the wizard closes (finished, skipped, or failed to persist). */
  onComplete: () => void;
}

const COMPANY_KEY = ['company-settings'] as const;

const STEP_COPY: Record<StepId, { title: string; description: string }> = {
  welcome: { title: 'Selamat datang di Entaris', description: 'Siapkan perusahaan Anda dalam beberapa menit.' },
  company: { title: 'Profil perusahaan', description: 'Data ini tampil di kop faktur, surat jalan, dan laporan.' },
  fiscal: { title: 'Tahun buku', description: 'Periode akuntansi tempat transaksi dicatat.' },
  security: { title: 'Keamanan akun', description: 'Ganti kata sandi bawaan akun admin sebelum tim mulai bekerja.' },
  done: { title: 'Penyiapan selesai', description: 'Anda bisa mulai menggunakan Entaris.' },
};

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

/**
 * First-run setup for admins. Shown only to users who can edit settings, and
 * only while the company has no `onboardedAt`. Finishing or skipping stores the
 * timestamp on the server, so it never reappears on another browser and never
 * blocks non-admins. `localStorage.onboardingDone === 'true'` still suppresses it.
 */
const OnboardingWizard = ({ onComplete }: OnboardingWizardProps) => {
  const company = useCompanySettings() as OnboardingCompany | null;
  const [canManage] = useState(() => can('settings', 'edit'));
  const [suppressed] = useState(isLocallySuppressed);
  // Latch: once open, stay mounted until the wizard closes itself, even after
  // the cached company record gains `onboardedAt` mid-flow (password step).
  const [latched, setLatched] = useState(false);
  if (!latched && company && shouldShowWizard({ canManage, suppressed, company })) setLatched(true);

  if (!latched || !company) return null;
  return <WizardDialog company={company} onClose={onComplete} />;
};

function WizardDialog({ company, onClose }: { company: OnboardingCompany; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [companyError, setCompanyError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [companyForm, setCompanyForm] = useState<CompanyForm>(() => ({
    companyName: realCompanyName(company.companyName),
    address: company.address ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    taxId: company.taxId ?? '',
  }));
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const stepId = STEPS[step].id;
  const bodyRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Move focus into the new step: its first field, else the primary action.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const field = bodyRef.current?.querySelector<HTMLElement>('input, textarea');
    (field ?? primaryRef.current)?.focus();
  }, [step]);
  const { data: fiscalYears, isLoading: fiscalLoading } = useQuery<FiscalYearLite[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => (await api.get('/fiscal-years')).data,
    enabled: stepId === 'fiscal',
  });

  /** Persist done/skipped; on failure close anyway (never block) and say it will return. */
  const persist = async (): Promise<boolean> => {
    try {
      const onboardedAt = await completeOnboarding();
      queryClient.setQueryData<OnboardingCompany>(COMPANY_KEY, (old) => (old ? { ...old, onboardedAt } : old));
      markDoneLocally();
      return true;
    } catch {
      toast.error('Status penyiapan gagal disimpan. Panduan ini akan muncul lagi saat Anda masuk berikutnya.');
      return false;
    }
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    await persist();
    setBusy(false);
    onClose();
  };

  const saveCompany = async (): Promise<boolean> => {
    if (!companyForm.companyName.trim()) {
      setCompanyError('Nama perusahaan wajib diisi.');
      return false;
    }
    setCompanyError(undefined);
    try {
      await api.put('/settings/company', companyUpdatePayload(company, companyForm));
      await queryClient.invalidateQueries({ queryKey: COMPANY_KEY });
      return true;
    } catch (err) {
      setCompanyError(errorMessage(err, 'Gagal menyimpan profil perusahaan.'));
      return false;
    }
  };

  /** Returns true when the wizard may advance; a successful change ends the session. */
  const changePassword = async (): Promise<boolean> => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    if (!currentPassword && !newPassword && !confirmPassword) return true;
    const problem = !currentPassword
      ? 'Isi kata sandi saat ini.'
      : passwordProblem(newPassword) ?? (newPassword !== confirmPassword ? 'Ulangan kata sandi baru tidak cocok.' : null);
    if (problem) {
      setPasswordError(problem);
      return false;
    }
    setPasswordError(undefined);
    // The password change revokes this session, so record onboarding first.
    if (!(await persist())) return false;
    try {
      await api.put('/users/me/password', { currentPassword, newPassword });
    } catch (err) {
      setPasswordError(errorMessage(err, 'Gagal mengganti kata sandi.'));
      return false;
    }
    toast.success('Kata sandi diganti. Silakan masuk lagi dengan kata sandi baru.');
    localStorage.removeItem('user');
    queryClient.clear();
    window.location.assign('/login');
    return false;
  };

  const next = async () => {
    if (stepId === 'done') return finish();
    setBusy(true);
    let ok = true;
    if (stepId === 'company') ok = await saveCompany();
    if (stepId === 'security') ok = await changePassword();
    setBusy(false);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    else requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const wantsPasswordChange = Object.values(passwordForm).some(Boolean);
  const primaryLabel: Record<StepId, string> = {
    welcome: 'Mulai penyiapan',
    company: 'Simpan & lanjut',
    fiscal: 'Lanjut',
    security: wantsPasswordChange ? 'Ganti kata sandi' : 'Lanjut tanpa mengganti',
    done: 'Mulai gunakan Entaris',
  };
  const copy = STEP_COPY[stepId];

  return (
    <Dialog open onOpenChange={(open) => !open && void finish()}>
      <DialogContent
        size="md"
        hideClose
        aria-busy={busy || undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          primaryRef.current?.focus();
        }}
        className="gap-5"
      >
        <DialogHeader className="gap-3 pr-0">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <BrandMark size={20} variant="auto" title="" aria-hidden />
              Penyiapan awal
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Langkah {step + 1} dari {STEPS.length}
            </span>
          </div>
          <Stepper current={step} />
          <div className="space-y-1 pt-1">
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </div>
        </DialogHeader>

        <div ref={bodyRef}>
          {stepId === 'welcome' && <WelcomeStep />}
          {stepId === 'company' && <CompanyStep form={companyForm} onChange={setCompanyForm} error={companyError} />}
          {stepId === 'fiscal' && <FiscalStep years={fiscalYears} loading={fiscalLoading} />}
          {stepId === 'security' && <SecurityStep form={passwordForm} onChange={setPasswordForm} error={passwordError} />}
          {stepId === 'done' && <DoneStep companyName={realCompanyName(companyForm.companyName)} />}
        </div>

        <DialogFooter className="items-stretch border-t border-border pt-4 sm:items-center sm:justify-between">
          {stepId !== 'done' ? (
            <Button variant="ghost" size="md" onClick={() => void finish()} disabled={busy} className="text-muted-foreground">
              Lewati penyiapan
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step > 0 && stepId !== 'done' && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                Kembali
              </Button>
            )}
            <Button ref={primaryRef} onClick={() => void next()} loading={busy}>
              {primaryLabel[stepId]}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingWizard;
