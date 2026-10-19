/**
 * Single source for what `useHotkey` binds and what the shortcut help dialog lists.
 * Combos (case-insensitive): `mod+k` = Ctrl or ⌘; `?` = one key; `g d` = sequence within
 * SEQUENCE_TIMEOUT_MS; `escape` is handled by dialogs and listed for reference only.
 */
import { getRoute } from '@/app/routes';
import i18n from '@/i18n';

/** Group id; the heading is `shell:shortcuts.groups.<id>`. */
export type ShortcutGroup = 'general' | 'navigation' | 'palette';

type LabelKey = 'paletteOpen' | 'helpOpen' | 'overlayClose' | 'paletteMove' | 'paletteSelect';

export interface ShortcutDef {
  id: string;
  /** Combos that trigger it; the first one is shown in the help dialog. */
  combos: readonly string[];
  /** Description shown in the help dialog (getter: translated on read). */
  readonly label: string;
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

type ShortcutInput = Omit<ShortcutDef, 'label'>;

const def = (input: ShortcutInput, labelKey: LabelKey): ShortcutDef => ({
  ...input,
  get label() {
    return i18n.t(`shortcuts.labels.${labelKey}`, { ns: 'shell' });
  },
});

const goTo = (key: string, path: string): ShortcutDef => ({
  id: `goto.${key}`,
  combos: [`g ${key}`],
  group: 'navigation',
  path,
  get label() {
    return i18n.t('shortcuts.labels.goTo', { ns: 'shell', page: getRoute(path)?.label ?? path });
  },
});

export const SHORTCUTS: readonly ShortcutDef[] = [
  def({ id: 'palette.open', combos: ['mod+k'], group: 'general' }, 'paletteOpen'),
  def({ id: 'help.open', combos: ['?'], group: 'general' }, 'helpOpen'),
  def({ id: 'overlay.close', combos: ['escape'], group: 'general', passive: true }, 'overlayClose'),
  ...GO_TO.map(({ key, path }) => goTo(key, path)),
  def({ id: 'palette.move', combos: ['arrowup', 'arrowdown'], group: 'palette', passive: true }, 'paletteMove'),
  def({ id: 'palette.select', combos: ['enter'], group: 'palette', passive: true }, 'paletteSelect'),
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['general', 'navigation', 'palette'];

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
        if (part === 'space') return i18n.t('shortcuts.keys.space', { ns: 'shell' });
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
