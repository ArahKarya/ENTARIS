import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  companyUpdatePayload,
  passwordProblem,
  setupChecklist,
  shouldShowWizard,
  type OnboardingCompany,
} from './onboarding-state';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
const companyRef = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock('@/lib/api', () => ({ default: apiMock }));
vi.mock('@/contexts/CompanySettingsContext', () => ({ useCompanySettings: () => companyRef.current }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OnboardingWizard from '@/components/OnboardingWizard';
import { SetupChecklistCard } from './SetupChecklistCard';

/** Node ≥22 ships a global localStorage that shadows jsdom's; use a clean in-memory one. */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  });
}

const ADMIN = { role: 'Admin', isSuperAdmin: true };
const VIEWER = { role: 'Viewer', permissions: { settings: { view: true, edit: false } } };

function setUser(user: Record<string, unknown>) {
  localStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'u', fullName: 'Uji', ...user }));
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE_COMPANY: OnboardingCompany = {
  id: 'c1',
  companyName: 'Nama Perusahaan Anda',
  address: null,
  phone: null,
  email: null,
  taxId: '01.234',
  logoUrl: null,
  defaultCurrency: 'USD',
  fiscalYearStartMonth: 4,
  onboardedAt: null,
};

describe('onboarding-state', () => {
  it('shows the wizard only to settings editors while onboardedAt is null', () => {
    const company = { onboardedAt: null };
    expect(shouldShowWizard({ canManage: true, suppressed: false, company })).toBe(true);
    expect(shouldShowWizard({ canManage: false, suppressed: false, company })).toBe(false);
    expect(shouldShowWizard({ canManage: true, suppressed: true, company })).toBe(false);
    expect(shouldShowWizard({ canManage: true, suppressed: false, company: null })).toBe(false);
    expect(shouldShowWizard({ canManage: true, suppressed: false, company: { onboardedAt: '2026-10-03T00:00:00Z' } })).toBe(false);
    // Older API without the field: never open.
    expect(shouldShowWizard({ canManage: true, suppressed: false, company: {} })).toBe(false);
  });

  it('keeps currency, fiscal start month and trims edits in the company payload', () => {
    const payload = companyUpdatePayload(BASE_COMPANY, {
      companyName: '  PT Maju  ',
      address: ' ',
      phone: '021',
      email: '',
      taxId: '01.234',
    });
    expect(payload).toEqual({
      companyName: 'PT Maju',
      address: null,
      phone: '021',
      email: '',
      taxId: '01.234',
      defaultCurrency: 'USD',
      fiscalYearStartMonth: 4,
    });
  });

  it('mirrors the server password rules', () => {
    expect(passwordProblem('Ab1!')).toMatch(/8 karakter/);
    expect(passwordProblem('abcdefg1!')).toMatch(/huruf besar/);
    expect(passwordProblem('Abcdefgh!')).toMatch(/angka/);
    expect(passwordProblem('Abcdefg1')).toMatch(/karakter khusus/);
    expect(passwordProblem('Abcdefg1!')).toBeNull();
  });

  it('builds the checklist; placeholder name is not a profile, team needs >1 user', () => {
    const items = setupChecklist({
      company: { ...BASE_COMPANY, address: 'Jl. A' },
      fiscalYears: [{ id: 'f', name: '2026', startDate: '', endDate: '', isClosed: false }],
      userCount: 1,
    });
    const done = Object.fromEntries(items.map((i) => [i.id, i.done]));
    expect(done).toEqual({ profile: false, logo: false, taxId: true, fiscalYear: true, team: false });
    expect(setupChecklist({ company: BASE_COMPANY, fiscalYears: [], userCount: undefined }).map((i) => i.id)).not.toContain('team');
  });
});

describe('OnboardingWizard', () => {
  beforeEach(() => {
    stubStorage();
    apiMock.get.mockReset().mockResolvedValue({ data: [] });
    apiMock.post.mockReset().mockResolvedValue({ data: { id: 'c1', onboardedAt: '2026-10-03T10:00:00.000Z' } });
    apiMock.put.mockReset().mockResolvedValue({ data: {} });
    companyRef.current = { ...BASE_COMPANY };
  });

  it('opens as an accessible dialog for admins when onboarding is pending', () => {
    setUser(ADMIN);
    wrap(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Selamat datang di Entaris' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Langkah penyiapan' })).toBeInTheDocument();
  });

  it('never renders for users without settings edit permission', () => {
    setUser(VIEWER);
    wrap(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('honours the legacy localStorage suppression and server onboardedAt', () => {
    setUser(ADMIN);
    localStorage.setItem('onboardingDone', 'true');
    const { unmount } = wrap(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    localStorage.removeItem('onboardingDone');
    companyRef.current = { ...BASE_COMPANY, onboardedAt: '2026-10-01T00:00:00Z' };
    wrap(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('skipping persists to the server and closes', async () => {
    setUser(ADMIN);
    const onComplete = vi.fn();
    wrap(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lewati penyiapan' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith('/settings/company/onboarding');
    expect(localStorage.getItem('onboardingDone')).toBe('true');
  });

  it('closes without blocking when the server call fails, and does not suppress locally', async () => {
    setUser(ADMIN);
    apiMock.post.mockRejectedValueOnce(new Error('offline'));
    const onComplete = vi.fn();
    wrap(<OnboardingWizard onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lewati penyiapan' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('onboardingDone')).toBeNull();
  });

  it('requires a real company name and saves the full profile', async () => {
    setUser(ADMIN);
    wrap(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai penyiapan' }));
    const name = await screen.findByRole('textbox', { name: /Nama perusahaan/ });
    expect(name).toHaveValue(''); // seed placeholder is not prefilled
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & lanjut' }));
    expect(await screen.findByText('Nama perusahaan wajib diisi.')).toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: 'PT Maju' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & lanjut' }));
    await screen.findByRole('dialog', { name: 'Tahun buku' });
    expect(apiMock.put).toHaveBeenCalledWith(
      '/settings/company',
      expect.objectContaining({ companyName: 'PT Maju', taxId: '01.234', defaultCurrency: 'USD', fiscalYearStartMonth: 4 }),
    );
  });

  it('validates the password locally before calling the server', async () => {
    setUser(ADMIN);
    wrap(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai penyiapan' }));
    fireEvent.change(await screen.findByRole('textbox', { name: /Nama perusahaan/ }), { target: { value: 'PT Maju' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & lanjut' }));
    await screen.findByRole('dialog', { name: 'Tahun buku' });
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
    await screen.findByRole('dialog', { name: 'Keamanan akun' });
    fireEvent.change(screen.getByLabelText('Kata sandi saat ini'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('Kata sandi baru'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ganti kata sandi' }));
    expect(await screen.findByText(/minimal 8 karakter/)).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe('SetupChecklistCard', () => {
  beforeEach(() => {
    stubStorage();
    apiMock.get.mockReset().mockImplementation(async (url: string) =>
      url === '/users' ? { data: { total: 1 } } : { data: [{ id: 'f', name: '2026', startDate: '', endDate: '', isClosed: false }] },
    );
  });

  it('stays hidden until onboarding was finished or skipped', () => {
    setUser(ADMIN);
    companyRef.current = { ...BASE_COMPANY, onboardedAt: null };
    wrap(<SetupChecklistCard />);
    expect(screen.queryByRole('region', { name: 'Lengkapi penyiapan' })).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it('lists open tasks for admins and can be dismissed for good', async () => {
    setUser(ADMIN);
    companyRef.current = { ...BASE_COMPANY, onboardedAt: '2026-10-03T00:00:00Z' };
    const { unmount } = wrap(<SetupChecklistCard />);
    const card = await screen.findByRole('region', { name: 'Lengkapi penyiapan' });
    expect(card).toHaveTextContent('2 dari 5 langkah selesai');
    expect(screen.getByRole('link', { name: /Unggah logo perusahaan/ })).toHaveAttribute('href', '/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan daftar penyiapan' }));
    expect(screen.queryByRole('region', { name: 'Lengkapi penyiapan' })).not.toBeInTheDocument();
    unmount();
    wrap(<SetupChecklistCard />);
    expect(screen.queryByRole('region', { name: 'Lengkapi penyiapan' })).not.toBeInTheDocument();
  });

  it('never shows for non-admins', () => {
    setUser(VIEWER);
    companyRef.current = { ...BASE_COMPANY, onboardedAt: '2026-10-03T00:00:00Z' };
    wrap(<SetupChecklistCard />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
