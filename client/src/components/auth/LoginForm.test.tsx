import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginForm } from './LoginForm';

const post = vi.fn();
vi.mock('@/lib/api', () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

function renderForm(props: Partial<React.ComponentProps<typeof LoginForm>> = {}, from?: string) {
  const onForgotPassword = vi.fn();
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from } : null }]}>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginForm product="ERP" tenant={null} onForgotPassword={onForgotPassword} {...props} />
          }
        />
        <Route path="/" element={<p>beranda</p>} />
        <Route path="/sales" element={<p>halaman sales</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onForgotPassword };
}

const username = () => screen.getByLabelText('Email atau username');
const password = () => screen.getByLabelText('Kata sandi', { selector: 'input' });
const submit = () => screen.getByRole('button', { name: /^Masuk$/ });

function fill(user: string, pass: string) {
  fireEvent.change(username(), { target: { value: user } });
  fireEvent.change(password(), { target: { value: pass } });
}

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

beforeEach(() => {
  post.mockReset();
  stubStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('validates empty fields inline without calling the API', () => {
    renderForm();
    fireEvent.click(submit());
    expect(post).not.toHaveBeenCalled();
    expect(username()).toHaveAttribute('aria-invalid', 'true');
    expect(username()).toHaveAccessibleDescription('Email atau username wajib diisi');
    expect(password()).toHaveAccessibleDescription('Kata sandi wajib diisi');
    expect(username()).toHaveFocus();
  });

  it('focuses the password when only it is missing', () => {
    renderForm();
    fireEvent.change(username(), { target: { value: 'admin' } });
    fireEvent.click(submit());
    expect(post).not.toHaveBeenCalled();
    expect(username()).not.toHaveAttribute('aria-invalid');
    expect(password()).toHaveFocus();
  });

  it('shows the 401 banner and clears the password', async () => {
    post.mockRejectedValueOnce({ response: { status: 401, headers: {} } });
    renderForm();
    fill('admin', 'salah');
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Email/username atau kata sandi salah.');
    expect(password()).toHaveValue('');
    await waitFor(() => expect(password()).toHaveFocus());
  });

  it('shows the network error when the server is unreachable', async () => {
    post.mockRejectedValueOnce({ request: {} });
    renderForm();
    fill('admin', 'rahasia');
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Tidak dapat terhubung ke server.');
  });

  it('locks the button with a live countdown on 429', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    post.mockRejectedValueOnce({ response: { status: 429, headers: { 'ratelimit-reset': '65' } } });
    renderForm();
    fill('admin', 'rahasia');
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Coba lagi dalam sekitar 2 menit');
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(submit()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(submit());
    expect(post).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('1:00')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.queryByText(/Terlalu banyak percobaan/)).not.toBeInTheDocument();
    expect(submit()).not.toHaveAttribute('aria-disabled');
  });

  it('shows the session-expired notice', () => {
    renderForm({ sessionExpired: true });
    expect(screen.getByRole('status')).toHaveTextContent('Sesi Anda berakhir. Silakan masuk kembali.');
  });

  it('toggles password visibility with an accessible, tabbable button', () => {
    renderForm();
    const toggle = screen.getByRole('button', { name: 'Tampilkan kata sandi' });
    expect(toggle).not.toHaveAttribute('tabindex', '-1');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Sembunyikan kata sandi' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the Caps Lock hint', () => {
    renderForm();
    // jsdom has no CapsLock state; patch getModifierState on a real event.
    const event = new KeyboardEvent('keydown', { key: 'A', bubbles: true });
    Object.defineProperty(event, 'getModifierState', { value: (k: string) => k === 'CapsLock' });
    act(() => {
      password().dispatchEvent(event);
    });
    expect(screen.getByText('Caps Lock aktif')).toBeInTheDocument();
    expect(password().getAttribute('aria-describedby')).toContain('login-password-caps');
  });

  it('opens the forgot-password dialog callback', () => {
    const { onForgotPassword } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Lupa kata sandi?' }));
    expect(onForgotPassword).toHaveBeenCalledOnce();
  });

  it('shows the workspace chip only when a tenant is given', () => {
    renderForm({ tenant: 'PT Sukses Makmur' });
    expect(screen.getAllByText(/PT Sukses Makmur/).length).toBeGreaterThan(0);
  });

  it('stores the user and returns to the original route', async () => {
    post.mockResolvedValueOnce({ data: { user: { id: '1', username: 'admin' } } });
    renderForm({}, '/sales');
    fill(' admin ', 'rahasia');
    fireEvent.click(submit());
    expect(await screen.findByText('halaman sales')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'rahasia' });
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ username: 'admin' });
  });
});
