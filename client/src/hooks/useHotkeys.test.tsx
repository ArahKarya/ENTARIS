import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useGoToShortcuts, useHotkey, useShortcut, allowedGoToShortcuts } from './useHotkeys';
import { SHORTCUTS, comboKeycaps, ariaKeyshortcuts, getShortcut } from './shortcuts';
import { getRoute } from '@/app/routes';

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

const press = (key: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
  fireEvent.keyDown(target, { key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : '', ...init });

function Probe({ combo, onFire }: { combo: string | string[]; onFire: (c: string) => void }) {
  useHotkey(combo, onFire);
  return <input aria-label="field" />;
}

describe('shortcut map', () => {
  it('has unique ids and labels every go-to target from the route registry', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS.filter((x) => x.path)) {
      expect(getRoute(s.path!), s.id).toBeDefined();
      expect(s.label).toBe(`Buka ${getRoute(s.path!)!.label}`);
    }
  });

  it('no longer advertises Ctrl+N (it never existed)', () => {
    expect(SHORTCUTS.flatMap((s) => s.combos)).not.toContain('mod+n');
  });

  it('formats keycaps per platform and sequences per step', () => {
    expect(comboKeycaps('mod+k', false)).toEqual([['Ctrl', 'K']]);
    expect(comboKeycaps('mod+k', true)).toEqual([['⌘', 'K']]);
    expect(comboKeycaps('g d', false)).toEqual([['G'], ['D']]);
    expect(comboKeycaps('escape', false)).toEqual([['Esc']]);
    expect(ariaKeyshortcuts('mod+k')).toBe('Control+K Meta+K');
  });
});

describe('useHotkey', () => {
  it('fires mod+k with Ctrl or Meta, also inside an input', () => {
    const fn = vi.fn();
    render(<Probe combo="mod+k" onFire={fn} />);
    press('k', { ctrlKey: true });
    press('k', { metaKey: true }, screen.getByLabelText('field'));
    press('k');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ignores plain keys while typing', () => {
    const fn = vi.fn();
    render(<Probe combo="?" onFire={fn} />);
    press('?', { shiftKey: true }, screen.getByLabelText('field'));
    expect(fn).not.toHaveBeenCalled();
    press('?', { shiftKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('matches sequences and reports which combo fired', () => {
    const fn = vi.fn();
    render(<Probe combo={['g d', 'g l']} onFire={fn} />);
    press('g');
    press('l');
    expect(fn).toHaveBeenLastCalledWith('g l');
    press('g');
    press('x');
    press('d');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores plain keys while a dialog is open', () => {
    const fn = vi.fn();
    render(
      <>
        <Probe combo="?" onFire={fn} />
        <div role="dialog" data-state="open" />
      </>,
    );
    press('?', { shiftKey: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it('useShortcut binds by id and passive entries bind nothing', () => {
    const open = vi.fn();
    const passive = vi.fn();
    function Ids() {
      useShortcut('palette.open', open);
      useShortcut('overlay.close', passive);
      return null;
    }
    render(<Ids />);
    press('k', { ctrlKey: true });
    press('Escape');
    expect(open).toHaveBeenCalledTimes(1);
    expect(passive).not.toHaveBeenCalled();
    expect(getShortcut('overlay.close')?.passive).toBe(true);
  });
});

describe('go-to shortcuts', () => {
  beforeEach(stubStorage);

  function Where() {
    useGoToShortcuts();
    return <p data-testid="path">{useLocation().pathname}</p>;
  }

  it('navigates with g <key> only to pages the user may view', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'u', role: 'Viewer', permissions: { sales_invoice: { view: true, edit: false } } }),
    );
    render(
      <MemoryRouter initialEntries={['/']}>
        <Where />
      </MemoryRouter>,
    );
    press('g');
    press('p');
    expect(screen.getByTestId('path')).toHaveTextContent('/sales');
    press('g');
    press('b'); // /purchase needs purchase_invoice
    expect(screen.getByTestId('path')).toHaveTextContent('/sales');
    expect(allowedGoToShortcuts().map((s) => s.path)).not.toContain('/purchase');
  });
});
