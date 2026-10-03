import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReturnFocus } from './useReturnFocus';

function closeEvent() {
  return new Event('focusout', { cancelable: true });
}

describe('useReturnFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns focus to the element that had it', () => {
    document.body.innerHTML = '<button id="b">B</button>';
    const button = document.getElementById('b')!;
    button.focus();
    const { result } = renderHook(() => useReturnFocus());
    result.current.capture();
    document.body.focus();
    const event = closeEvent();
    result.current.onCloseAutoFocus(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('returns to the menu trigger when opened from a menu item (and from a submenu item)', () => {
    document.body.innerHTML = `
      <button id="trigger">Menu</button>
      <div role="menu" aria-labelledby="trigger">
        <div role="menuitem" tabindex="-1" id="item">Tentang</div>
        <div role="menuitem" tabindex="-1" id="sub-trigger">Tema</div>
      </div>
      <div role="menu" aria-labelledby="sub-trigger">
        <div role="menuitem" tabindex="-1" id="sub-item">Gelap</div>
      </div>`;
    const trigger = document.getElementById('trigger')!;
    for (const id of ['item', 'sub-item']) {
      document.getElementById(id)!.focus();
      const { result } = renderHook(() => useReturnFocus());
      result.current.capture();
      document.body.focus();
      result.current.onCloseAutoFocus(closeEvent());
      expect(document.activeElement).toBe(trigger);
    }
  });

  it('leaves Radix default when the captured element is gone', () => {
    document.body.innerHTML = '<button id="b">B</button>';
    document.getElementById('b')!.focus();
    const { result } = renderHook(() => useReturnFocus());
    result.current.capture();
    document.body.innerHTML = '';
    const event = closeEvent();
    result.current.onCloseAutoFocus(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
