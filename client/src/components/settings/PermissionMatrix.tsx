import { Fragment } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  columnState, rowState, rowsState, setMany, setPerm, setRow, setRows,
  type CheckState, type ModuleLike, type PermAction, type PermDraft,
} from './permissionMatrixState';

export interface PermissionMatrixProps {
  groups: Array<[string, ModuleLike[]]>;
  draft: PermDraft;
  onChange: (next: PermDraft) => void;
  disabled?: boolean;
  /** Accessible caption (role name). */
  caption: string;
}

const ACTIONS: Array<{ action: PermAction; label: string }> = [
  { action: 'view', label: 'Lihat' },
  { action: 'edit', label: 'Ubah' },
];

interface TriCheckProps {
  state: CheckState;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Checkbox that renders mixed state and toggles to "all" when mixed. */
function TriCheck({ state, onChange, label, disabled }: TriCheckProps) {
  return (
    <Checkbox
      checked={state === true}
      indeterminate={state === 'indeterminate'}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={() => onChange(state !== true)}
      className={MIXED_CLASS}
    />
  );
}

/** Mixed state: filled box with a dash instead of the frozen primitive's check icon. */
const MIXED_CLASS = [
  'data-[indeterminate]:border-primary data-[indeterminate]:bg-primary',
  '[&[data-indeterminate]_svg]:hidden',
  'data-[indeterminate]:before:absolute data-[indeterminate]:before:h-0.5 data-[indeterminate]:before:w-2',
  'data-[indeterminate]:before:rounded-full data-[indeterminate]:before:bg-primary-foreground',
].join(' ');

const headCell = 'sticky top-0 z-20 bg-muted px-3 py-2.5 text-xs font-medium text-muted-foreground';
const stickyCol = 'sticky left-0 z-10';

/** Modules × view/edit matrix with group headers and bulk toggles. */
export function PermissionMatrix({ groups, draft, onChange, disabled, caption }: PermissionMatrixProps) {
  const allMods = groups.flatMap(([, mods]) => mods.map((m) => m.key));

  return (
    <div
      role="region"
      aria-label={`Matriks hak akses ${caption}`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
      tabIndex={0}
      className="relative max-h-[65vh] overflow-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-[300px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Hak akses modul untuk peran {caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(headCell, stickyCol, 'z-30 border-b border-border text-left')}>Modul</th>
            {ACTIONS.map(({ action, label }) => (
              <th key={action} scope="col" className={cn(headCell, 'w-16 border-b border-border text-center')}>
                <span className="flex flex-col items-center gap-1.5">
                  {label}
                  <TriCheck
                    state={columnState(draft, allMods, action)}
                    disabled={disabled}
                    label={`${label} semua modul`}
                    onChange={(v) => onChange(setMany(draft, allMods, action, v))}
                  />
                </span>
              </th>
            ))}
            <th scope="col" className={cn(headCell, 'w-16 border-b border-border text-center')}>
              <span className="flex flex-col items-center gap-1.5">
                Semua
                <TriCheck
                  state={rowsState(draft, allMods)}
                  disabled={disabled}
                  label="Akses penuh semua modul"
                  onChange={(v) => onChange(setRows(draft, allMods, v))}
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([group, mods]) => {
            const keys = mods.map((m) => m.key);
            return (
              <Fragment key={group}>
                <tr className="bg-muted/60">
                  <th
                    scope="colgroup"
                    className={cn(stickyCol, 'border-b border-border bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground')}
                  >
                    {group}
                  </th>
                  {ACTIONS.map(({ action, label }) => (
                    <td key={action} className="border-b border-border bg-muted px-3 py-2 text-center">
                      <TriCheck
                        state={columnState(draft, keys, action)}
                        disabled={disabled}
                        label={`${label} semua modul grup ${group}`}
                        onChange={(v) => onChange(setMany(draft, keys, action, v))}
                      />
                    </td>
                  ))}
                  <td className="border-b border-border bg-muted px-3 py-2 text-center">
                    <TriCheck
                      state={rowsState(draft, keys)}
                      disabled={disabled}
                      label={`Akses penuh grup ${group}`}
                      onChange={(v) => onChange(setRows(draft, keys, v))}
                    />
                  </td>
                </tr>
                {mods.map((m) => {
                  const p = draft[m.key] ?? { view: false, edit: false };
                  return (
                    <tr key={m.key} className="group/row">
                      <th
                        scope="row"
                        className={cn(stickyCol, 'border-b border-border bg-card px-3 py-2 text-left font-normal text-foreground group-hover/row:bg-accent')}
                      >
                        {m.label}
                      </th>
                      {ACTIONS.map(({ action, label }) => (
                        <td key={action} className="border-b border-border px-3 py-2 text-center group-hover/row:bg-accent">
                          <Checkbox
                            checked={p[action]}
                            disabled={disabled}
                            aria-label={`${label} ${m.label}`}
                            onCheckedChange={(v) => onChange(setPerm(draft, m.key, action, v === true))}
                          />
                        </td>
                      ))}
                      <td className="border-b border-border px-3 py-2 text-center group-hover/row:bg-accent">
                        <TriCheck
                          state={rowState(draft, m.key)}
                          disabled={disabled}
                          label={`Akses penuh ${m.label}`}
                          onChange={(v) => onChange(setRow(draft, m.key, v))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
