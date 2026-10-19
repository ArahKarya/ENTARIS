import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MotionProvider } from './MotionContext';
import { useMotion } from './motion-context';

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: reduced,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

/** Node ≥22 ships a global localStorage that shadows jsdom's; use a clean in-memory one. */
function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
  return data;
}

function Probe() {
  const { motion, followsDevice, setMotion } = useMotion();
  return (
    <div>
      <span data-testid="motion">{motion}</span>
      <span data-testid="follows">{String(followsDevice)}</span>
      <button onClick={() => setMotion('lively')}>lively</button>
    </div>
  );
}

describe('MotionProvider', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.motion;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to smooth and marks <html>', () => {
    mockReducedMotion(false);
    stubStorage();
    render(<MotionProvider><Probe /></MotionProvider>);
    expect(screen.getByTestId('motion').textContent).toBe('smooth');
    expect(screen.getByTestId('follows').textContent).toBe('true');
    expect(document.documentElement.dataset.motion).toBe('smooth');
  });

  it('uses none when the device asks for reduced motion', () => {
    mockReducedMotion(true);
    stubStorage();
    render(<MotionProvider><Probe /></MotionProvider>);
    expect(document.documentElement.dataset.motion).toBe('none');
  });

  it('stores a chosen level, which then beats the device setting', () => {
    mockReducedMotion(true);
    const data = stubStorage();
    render(<MotionProvider><Probe /></MotionProvider>);
    act(() => screen.getByText('lively').click());
    expect(data.get('motion')).toBe('lively');
    expect(screen.getByTestId('follows').textContent).toBe('false');
    expect(document.documentElement.dataset.motion).toBe('lively');
  });
});
