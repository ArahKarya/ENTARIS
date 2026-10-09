/**
 * Onboarding state helpers, free of React so the gating rules are unit-testable.
 * The server (`company_settings.onboarded_at`) is the source of truth; the
 * localStorage flag `onboardingDone='true'` still suppresses it (e2e setup relies on it).
 */
import api from '@/lib/api';
import { tenantName } from '@/components/auth/login-helpers';

/** Wizard steps, in order. */
export const STEPS = [
  { id: 'welcome', label: 'Mulai' },
  { id: 'company', label: 'Profil' },
  { id: 'fiscal', label: 'Tahun Buku' },
  { id: 'security', label: 'Keamanan' },
  { id: 'done', label: 'Selesai' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export const LOCAL_DONE_KEY = 'onboardingDone';
export const CHECKLIST_DISMISSED_KEY = 'setupChecklist.dismissed';

/** Subset of GET /settings/company the onboarding UI reads. */
export interface OnboardingCompany {
  id?: string;
  companyName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
  defaultCurrency?: string | null;
  fiscalYearStartMonth?: number | null;
  /** ISO timestamp, or null while the admin has not finished/skipped setup. */
  onboardedAt?: string | null;
}

export interface FiscalYearLite {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isClosed: boolean;
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    /* storage unavailable: server state still applies */
  }
}

export const isLocallySuppressed = () => readFlag(LOCAL_DONE_KEY);
export const markDoneLocally = () => writeFlag(LOCAL_DONE_KEY);
export const isChecklistDismissed = () => readFlag(CHECKLIST_DISMISSED_KEY);
export const dismissChecklist = () => writeFlag(CHECKLIST_DISMISSED_KEY);

/**
 * The wizard opens only for someone who can edit settings, once the company
 * record has loaded and says onboarding has not happened yet. Anything else
 * (loading, error, older API without the field, non-admin) shows nothing.
 */
export function shouldShowWizard(opts: {
  canManage: boolean;
  suppressed: boolean;
  company: OnboardingCompany | null | undefined;
}): boolean {
  const { canManage, suppressed, company } = opts;
  if (!canManage || suppressed || !company) return false;
  return company.onboardedAt === null;
}

/** Persist "done or skipped" on the server; returns the stored timestamp. */
export async function completeOnboarding(): Promise<string> {
  const res = await api.post<{ id: string; onboardedAt: string }>('/settings/company/onboarding');
  return res.data.onboardedAt;
}

/** Company name the admin actually typed (the seed placeholder counts as empty). */
export function realCompanyName(name: string | null | undefined): string {
  return tenantName(name) ?? '';
}

/**
 * PUT /settings/company replaces taxId/currency/fiscal start month when they are
 * omitted, so the wizard sends the whole profile with its edits merged in.
 */
export function companyUpdatePayload(
  current: OnboardingCompany | null | undefined,
  edits: Pick<OnboardingCompany, 'companyName' | 'address' | 'phone' | 'email' | 'taxId'>,
) {
  return {
    companyName: (edits.companyName ?? '').trim(),
    address: edits.address?.trim() || null,
    phone: edits.phone?.trim() || null,
    email: edits.email?.trim() || '',
    taxId: edits.taxId?.trim() || null,
    defaultCurrency: current?.defaultCurrency || 'IDR',
    fiscalYearStartMonth: current?.fiscalYearStartMonth ?? 1,
  };
}

/** Mirrors the server's ChangePasswordSchema so errors show before the request. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Kata sandi baru minimal 8 karakter.';
  if (!/[A-Z]/.test(password)) return 'Kata sandi baru harus mengandung huruf besar.';
  if (!/[0-9]/.test(password)) return 'Kata sandi baru harus mengandung angka.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Kata sandi baru harus mengandung karakter khusus.';
  return null;
}

export interface ChecklistItem {
  id: 'profile' | 'logo' | 'taxId' | 'fiscalYear' | 'team';
  label: string;
  hint: string;
  /** Where in the app the task is done, e.g. "Pengaturan › Profil Perusahaan". */
  where: string;
  href: string;
  done: boolean;
}

/** Setup tasks shown on the dashboard card, in the order an admin should do them. */
export function setupChecklist(opts: {
  company: OnboardingCompany;
  fiscalYears: FiscalYearLite[] | undefined;
  /** Total users, or undefined when the viewer cannot list users. */
  userCount: number | undefined;
}): ChecklistItem[] {
  const { company, fiscalYears, userCount } = opts;
  const items: ChecklistItem[] = [
    {
      id: 'profile',
      label: 'Lengkapi profil perusahaan',
      hint: 'Nama dan alamat tampil di faktur dan dokumen.',
      where: 'Pengaturan › Profil Perusahaan',
      href: '/settings',
      done: !!realCompanyName(company.companyName) && !!company.address?.trim(),
    },
    {
      id: 'logo',
      label: 'Unggah logo perusahaan',
      hint: 'Logo dicetak di kop dokumen.',
      where: 'Pengaturan › Profil Perusahaan',
      href: '/settings',
      done: !!company.logoUrl,
    },
    {
      id: 'taxId',
      label: 'Isi NPWP perusahaan',
      hint: 'Dibutuhkan untuk faktur dan laporan pajak.',
      where: 'Pengaturan › Profil Perusahaan',
      href: '/settings',
      done: !!company.taxId?.trim(),
    },
    {
      id: 'fiscalYear',
      label: 'Siapkan tahun buku',
      hint: 'Transaksi hanya bisa dicatat di tahun buku yang terbuka.',
      where: 'Pengaturan › Tahun Buku',
      href: '/settings',
      done: !!fiscalYears?.some((fy) => !fy.isClosed),
    },
  ];
  if (userCount !== undefined) {
    items.push({
      id: 'team',
      label: 'Undang anggota tim',
      hint: 'Tambahkan akun untuk staf keuangan, gudang, atau produksi.',
      where: 'Manajemen Pengguna',
      href: '/users',
      done: userCount > 1,
    });
  }
  return items;
}
