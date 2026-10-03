import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { can } from '@/lib/permissions';
import { getRoute } from '@/app/routes';
import { GO_TO_SHORTCUTS, SEQUENCE_TIMEOUT_MS, getShortcut, type ShortcutDef } from './shortcuts';

/** e.g. 'mod+k', 'ctrl+k', '?', 'shift+/', 'g d' (sequence). See ./shortcuts.ts. */
type KeyCombo = string;

interface ParsedStep {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function parseStep(step: string): ParsedStep {
  const parts = step.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl') || parts.includes('cmd') || parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

const parseCombo = (combo: KeyCombo): ParsedStep[] => combo.trim().split(/\s+/).map(parseStep);

/** Typing into a field: plain-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.isContentEditable || target.closest('[contenteditable="true"]') !== null;
}

/**
 * An open dialog/popover/menu/listbox (Radix sets data-state="open"): plain keys
 * must not act behind it (menus and selects use letters for typeahead).
 */
function hasOpenOverlay(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [aria-modal="true"], ' +
        '[role="menu"][data-state="open"], [role="listbox"][data-state="open"]',
    ) !== null
  );
}

function stepMatches(step: ParsedStep, e: KeyboardEvent): boolean {
  if (step.ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (step.shift && !e.shiftKey) return false;
  if (step.alt && !e.altKey) return false;
  // e.code fallback keeps letter shortcuts working on non-Latin layouts.
  return e.key.toLowerCase() === step.key || e.code.toLowerCase() === `key${step.key}`;
}

const MODIFIER_KEYS = new Set(['shift', 'control', 'meta', 'alt']);

/**
 * Bind one or more key combos on window. The callback receives the combo that
 * fired.
 *
 * - Modifier combos (mod+k) fire everywhere, including inside inputs.
 * - Plain keys and sequences (?, g d) are ignored while typing in a field or
 *   while a dialog/popover is open.
 * - The latest callback is always used; it does not need to be memoised.
 */
export function useHotkey(
  combo: KeyCombo | readonly KeyCombo[],
  callback: (combo: KeyCombo) => void,
  enabled = true,
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const signature = (typeof combo === 'string' ? [combo] : combo).join('|');

  useEffect(() => {
    if (!enabled || !signature) return;
    const combos = signature.split('|');
    const parsed = combos.map(parseCombo);
    // Index of the next expected step for each combo (sequences only).
    const progress = parsed.map(() => 0);
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || MODIFIER_KEYS.has(e.key.toLowerCase())) return;
      const blocked = isTypingTarget(e.target) || hasOpenOverlay();

      for (let i = 0; i < parsed.length; i++) {
        const steps = parsed[i];
        const step = steps[progress[i]];
        if (!step.ctrl && blocked) {
          progress[i] = 0;
          continue;
        }
        if (!stepMatches(step, e)) {
          // A wrong key restarts the sequence; it may itself be a first step.
          progress[i] = progress[i] > 0 && steps.length > 1 && stepMatches(steps[0], e) ? 1 : 0;
          continue;
        }
        if (progress[i] + 1 < steps.length) {
          progress[i] += 1;
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => progress.fill(0), SEQUENCE_TIMEOUT_MS);
          continue;
        }
        progress.fill(0);
        e.preventDefault();
        callbackRef.current(combos[i]);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      clearTimeout(resetTimer);
      window.removeEventListener('keydown', handler);
    };
  }, [signature, enabled]);
}

/** Bind a shortcut from the shared map by id (see ./shortcuts.ts). Passive entries bind nothing. */
export function useShortcut(id: string, callback: () => void, enabled = true) {
  const def = getShortcut(id);
  const bindable = !!def && !def.passive;
  useHotkey(bindable ? def.combos : [], () => callback(), enabled && bindable);
}

/** Go-to shortcuts whose target page passes the same RBAC check as the sidebar. */
export function allowedGoToShortcuts(canView: (module: string) => boolean = (m) => can(m, 'view')): ShortcutDef[] {
  return GO_TO_SHORTCUTS.filter((s) => {
    const route = s.path ? getRoute(s.path) : undefined;
    return !!route && (!route.module || canView(route.module));
  });
}

const GO_TO_COMBOS = GO_TO_SHORTCUTS.map((s) => s.combos[0]);

/** Binds every `g <key>` go-to shortcut from the map. Mount once inside the router. */
export function useGoToShortcuts(enabled = true) {
  const navigate = useNavigate();
  useHotkey(
    GO_TO_COMBOS,
    (combo) => {
      // Checked at key time so a permission refresh is honoured.
      const target = allowedGoToShortcuts().find((s) => s.combos[0] === combo);
      if (target?.path) navigate(target.path);
    },
    enabled,
  );
}
