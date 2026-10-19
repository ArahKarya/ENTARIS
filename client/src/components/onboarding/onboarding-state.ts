/**
 * Onboarding state helpers, free of React so the gating rules are unit-testable.
 * The server (`company_settings.onboarded_at`) is the source of truth; the
 * localStorage flag `onboardingDone='true'` still suppresses it (e2e setup relies on it).
 */
import api from '@/lib/api';
import i18n from '@/i18n';
import { tenantName } from '@/components/auth/login-helpers';

/** Wizard steps, in order. Label: `shell:onboarding.steps.<id>`. */
export const STEPS = [{ id: 'welcome' }, { id: 'company' }, { id: 'fiscal' }, { id: 'security' }, { id: 'done' }] as const;

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
  const msg = (key: 'min' | 'upper' | 'digit' | 'special') =>
    i18n.t(`onboarding.password.${key}`, { ns: 'shell', min: 8 });
  if (password.length < 8) return msg('min');
  if (!/[A-Z]/.test(password)) return msg('upper');
  if (!/[0-9]/.test(password)) return msg('digit');
  if (!/[^A-Za-z0-9]/.test(password)) return msg('special');
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

type ChecklistId = ChecklistItem['id'];

/** Translated label, hint and location of a checklist task (`shell:onboarding.checklist.items.<id>`). */
function checklistCopy(id: ChecklistId): Pick<ChecklistItem, 'label' | 'hint' | 'where'> {
  const k = `onboarding.checklist.items.${id}` as const;
  return {
    label: i18n.t(`${k}.label`, { ns: 'shell' }),
    hint: i18n.t(`${k}.hint`, { ns: 'shell' }),
    where: i18n.t(`${k}.where`, { ns: 'shell' }),
  };
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
      ...checklistCopy('profile'),
      href: '/settings',
      done: !!realCompanyName(company.companyName) && !!company.address?.trim(),
    },
    {
      id: 'logo',
      ...checklistCopy('logo'),
      href: '/settings',
      done: !!company.logoUrl,
    },
    {
      id: 'taxId',
      ...checklistCopy('taxId'),
      href: '/settings',
      done: !!company.taxId?.trim(),
    },
    {
      id: 'fiscalYear',
      ...checklistCopy('fiscalYear'),
      href: '/settings',
      done: !!fiscalYears?.some((fy) => !fy.isClosed),
    },
  ];
  if (userCount !== undefined) {
    items.push({
      id: 'team',
      ...checklistCopy('team'),
      href: '/users',
      done: userCount > 1,
    });
  }
  return items;
}
