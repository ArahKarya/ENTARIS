import { useEffect, useCallback } from 'react';

type KeyCombo = string; // e.g. 'ctrl+k', 'cmd+k', '?', 'escape'

export function useHotkey(combo: KeyCombo, callback: () => void, enabled = true) {
  const handler = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger in input/textarea/select unless it's Escape
    const target = e.target as HTMLElement;
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needsCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('mod');
    const needsShift = parts.includes('shift');
    const needsAlt = parts.includes('alt');

    const ctrlOrMeta = e.ctrlKey || e.metaKey;

    if (needsCtrl && !ctrlOrMeta) return;
    if (!needsCtrl && ctrlOrMeta) return;
    if (needsShift && !e.shiftKey) return;
    if (needsAlt && !e.altKey) return;

    const pressedKey = e.key.toLowerCase();

    // For simple keys like '?', don't trigger in inputs
    if (!needsCtrl && !needsShift && !needsAlt && isInput) return;

    if (pressedKey === key || e.code.toLowerCase() === `key${key}`) {
      e.preventDefault();
      callback();
    }
  }, [combo, callback, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
