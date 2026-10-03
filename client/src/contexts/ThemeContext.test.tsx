import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';
import { normalizeTheme, resolveTheme, THEME_PACKS } from '@/lib/theme';

type Listener = () => void;

function mockMatchMedia(initialDark: boolean) {
  const state = { dark: initialDark, listeners: new Set<Listener>() };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      get matches() {
        return state.dark;
      },
      addEventListener: (_: string, l: Listener) => state.listeners.add(l),
      removeEventListener: (_: string, l: Listener) => state.listeners.delete(l),
    })),
  );
  return {
    setDark(dark: boolean) {
      state.dark = dark;
      state.listeners.forEach((l) => l());
    },
  };
}

/** Node ≥22 ships a global localStorage that shadows jsdom's; use a clean in-memory one. */
function stubStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
    </div>
  );
}

describe('normalizeTheme / resolveTheme', () => {
  it('keeps the three supported ids and migrates everything else to system', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
    for (const legacy of ['bloomberg-dark', 'bloomberg-light', 'neo-clean', '', null, 42]) {
      expect(normalizeTheme(legacy)).toBe('system');
    }
  });

  it('resolves system against the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('offers exactly Terang / Gelap / Sistem', () => {
    expect(THEME_PACKS.map((t) => t.label)).toEqual(['Terang', 'Gelap', 'Sistem']);
  });
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    stubStorage();
    document.documentElement.className = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to system and follows the OS live', () => {
    const mq = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);

    act(() => mq.setDark(true));
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('migrates a stored legacy pack to system and removes its class', () => {
    mockMatchMedia(false);
    localStorage.setItem('theme', 'bloomberg-dark');
    document.documentElement.classList.add('bloomberg-dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(localStorage.getItem('theme')).toBe('system');
    expect(document.documentElement.classList.contains('bloomberg-dark')).toBe(false);
  });

  it('persists an explicit choice', () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByText('dark').click());
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
