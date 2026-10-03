/**
 * Keyboard shortcut map: the single source for what `useHotkey` binds and what
 * the "Pintasan Keyboard" dialog lists. Add a shortcut here, bind it with
 * `useShortcut(id, …)`, and the help dialog picks it up automatically.
 *
 * Combo syntax (case-insensitive):
 * - `mod+k`   Ctrl on Windows/Linux, ⌘ on macOS (ctrl/cmd are aliases)
 * - `?`       a single key
 * - `g d`     a sequence: press G, then D within SEQUENCE_TIMEOUT_MS
 * - `escape`  handled by the dialogs themselves; listed for reference only
 */
import { getRoute } from '@/app/routes';

export type ShortcutGroup = 'Umum' | 'Navigasi' | 'Palet perintah';

export interface ShortcutDef {
  id: string;
  /** Combos that trigger it; the first one is shown in the help dialog. */
  combos: readonly string[];
  /** Indonesian description shown in the help dialog. */
  label: string;
  group: ShortcutGroup;
  /** Target page for go-to shortcuts (label comes from the route registry). */
  path?: string;
  /**
   * Listed for reference only: the key is handled by a component (Radix
   * dialogs, the palette list), not by a global listener.
   */
  passive?: boolean;
}

export const SEQUENCE_TIMEOUT_MS = 1000;

/** Go-to targets, `g <key>`. Labels come from the registry so they never drift. */
const GO_TO: readonly { key: string; path: string }[] = [
  { key: 'd', path: '/' },
  { key: 'a', path: '/aira' },
  { key: 'p', path: '/sales' },
  { key: 'b', path: '/purchase' },
  { key: 'l', path: '/reports' },
  { key: 'n', path: '/notifications' },
];

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'palette.open', combos: ['mod+k'], label: 'Cari halaman, data, atau aksi', group: 'Umum' },
  { id: 'help.open', combos: ['?'], label: 'Tampilkan pintasan keyboard', group: 'Umum' },
  { id: 'overlay.close', combos: ['escape'], label: 'Tutup dialog, menu, atau panel', group: 'Umum', passive: true },
  ...GO_TO.map(({ key, path }) => ({
    id: `goto.${key}`,
    combos: [`g ${key}`],
    label: `Buka ${getRoute(path)?.label ?? path}`,
    group: 'Navigasi' as const,
    path,
  })),
  { id: 'palette.move', combos: ['arrowup', 'arrowdown'], label: 'Pindah antar-hasil', group: 'Palet perintah', passive: true },
  { id: 'palette.select', combos: ['enter'], label: 'Buka hasil yang dipilih', group: 'Palet perintah', passive: true },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Umum', 'Navigasi', 'Palet perintah'];

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: string): ShortcutDef | undefined {
  return BY_ID.get(id);
}

export const GO_TO_SHORTCUTS: readonly ShortcutDef[] = SHORTCUTS.filter((s) => s.path);

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

const KEY_NAMES: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  shift: 'Shift',
  alt: 'Alt',
  space: 'Spasi',
};

/**
 * Keycaps for one combo, for display. A sequence returns one keycap list per
 * step: "g d" → [["G"], ["D"]]; "mod+k" → [["Ctrl", "K"]] or [["⌘", "K"]].
 */
export function comboKeycaps(combo: string, mac = isMacPlatform()): string[][] {
  return combo
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((step) =>
      step.split('+').map((part) => {
        if (part === 'mod' || part === 'cmd' || part === 'ctrl') return mac ? '⌘' : 'Ctrl';
        return KEY_NAMES[part] ?? part.toUpperCase();
      }),
    );
}

/** aria-keyshortcuts value for a combo ("mod+k" → "Control+K Meta+K"). */
export function ariaKeyshortcuts(combo: string): string {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1].toUpperCase();
  return parts.length > 1 && ['mod', 'cmd', 'ctrl'].includes(parts[0]) ? `Control+${key} Meta+${key}` : key;
}
