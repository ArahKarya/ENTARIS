import { Fragment, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUTS, SHORTCUT_GROUPS, comboKeycaps, type ShortcutDef } from '@/hooks/shortcuts';
import { allowedGoToShortcuts } from '@/hooks/useHotkeys';
import { useReturnFocus } from '@/hooks/useReturnFocus';

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const kbdClass =
  'inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs leading-5 font-medium text-foreground';

/** Keycaps for every combo of a shortcut: "Ctrl K", "G lalu D", "↑ / ↓". */
function Combo({ combos }: { combos: readonly string[] }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {combos.map((combo, ci) => (
        <Fragment key={combo}>
          {ci > 0 && <span className="text-xs text-muted-foreground">/</span>}
          {comboKeycaps(combo).map((step, si) => (
            <Fragment key={si}>
              {si > 0 && <span className="text-xs text-muted-foreground">lalu</span>}
              {step.map((k) => (
                <kbd key={k} className={kbdClass}>
                  {k}
                </kbd>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/** "Pintasan Keyboard" dialog. Lists the shared shortcut map (hooks/shortcuts.ts). */
export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  // Go-to shortcuts appear only for pages the user may open (same rule as the sidebar).
  const groups = useMemo(() => {
    if (!isOpen) return [];
    const allowedGoTo = new Set(allowedGoToShortcuts().map((s) => s.id));
    const visible = SHORTCUTS.filter((s) => !s.path || allowedGoTo.has(s.id));
    return SHORTCUT_GROUPS.map((group) => ({ group, items: visible.filter((s) => s.group === group) })).filter(
      (g) => g.items.length > 0,
    );
  }, [isOpen]);

  const returnFocus = useReturnFocus();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        className="gap-5"
        onOpenAutoFocus={returnFocus.capture}
        onCloseAutoFocus={returnFocus.onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Pintasan Keyboard</DialogTitle>
          <DialogDescription>Bekerja lebih cepat tanpa mouse. Pintasan huruf tidak aktif saat Anda sedang mengetik.</DialogDescription>
        </DialogHeader>

        {groups.map(({ group, items }, gi) => (
          <section key={group} aria-labelledby={`shortcut-group-${gi}`}>
            <h3 id={`shortcut-group-${gi}`} className="mb-1 text-xs font-medium text-muted-foreground">
              {group}
            </h3>
            <dl className="divide-y divide-border">
              {items.map((s: ShortcutDef) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm text-foreground">{s.label}</dt>
                  <dd>
                    <Combo combos={s.combos} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
