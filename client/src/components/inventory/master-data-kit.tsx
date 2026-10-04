/**
 * UI shared by the production master-data tabs: toolbar (search + status
 * filter + slot + primary action), info note and the create/edit form sheet.
 */
import { forwardRef, useId, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Info, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { controlBase } from '@/components/ui/styles';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { ACTIVE_FILTER_OPTIONS, type ActiveFilter } from './master-data';

const ALL = '__all__';

interface MasterToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  searchLabel: string;
  status: ActiveFilter;
  onStatus: (v: ActiveFilter) => void;
  /** Extra filters. */
  children?: ReactNode;
  /** Summary text, e.g. "12 mesin · 10 aktif". */
  summary?: ReactNode;
  /** Primary action (create button). */
  action?: ReactNode;
}

export function MasterToolbar({
  search,
  onSearch,
  searchPlaceholder,
  searchLabel,
  status,
  onStatus,
  children,
  summary,
  action,
}: MasterToolbarProps) {
  const id = useId();
  return (
    <div role="search" aria-label="Filter daftar" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-auto sm:min-w-60 sm:max-w-sm sm:flex-1">
        <label htmlFor={`${id}-q`} className="sr-only">
          {searchLabel}
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={`${id}-q`}
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Hapus pencarian"
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="w-[calc(50%-0.25rem)] sm:w-40">
        <label htmlFor={`${id}-status`} className="sr-only">
          Status
        </label>
        <Select value={status || ALL} onValueChange={(v) => onStatus(v === ALL ? '' : (v as ActiveFilter))}>
          <SelectTrigger id={`${id}-status`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua status</SelectItem>
            {ACTIVE_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {children}
      {action && <div className="ml-auto flex items-center gap-2 sm:order-last">{action}</div>}
      {summary && <p className="num order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto">{summary}</p>}
    </div>
  );
}

/** Muted explanatory note (what this master is used for). */
export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground', className)}>
      <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Server error shown above the footer. */
  error?: string | null;
  saving?: boolean;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
  /** Left side of the footer (live summary). */
  footerNote?: ReactNode;
}

/** Right side sheet hosting a create/edit form; Enter submits, Esc closes (unless saving). */
export function FormSheet({ open, onOpenChange, title, description, error, saving, submitLabel, onSubmit, children, footerNote }: FormSheetProps) {
  const formId = useId();
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent size="md" hideClose={saving}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <SheetBody>
          <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-5">
            {children}
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </p>
            )}
          </form>
        </SheetBody>
        <SheetFooter className="sm:items-center">
          {footerNote && <p className="mr-auto hidden min-w-0 truncate text-xs text-muted-foreground sm:block">{footerNote}</p>}
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Group heading inside a form sheet. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Radio-card group (role=radiogroup) for small enums such as cost side / basis. */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string; icon?: ReactNode }>;
  onChange: (v: T) => void;
  columns?: 2 | 3;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-2', columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              checked ? 'border-primary bg-primary-subtle' : 'border-border bg-card hover:border-border-strong',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
            {o.icon && <span className={cn('mt-0.5 shrink-0', checked ? 'text-primary-subtle-foreground' : 'text-muted-foreground')}>{o.icon}</span>}
            <span className="min-w-0">
              <span className={cn('block font-medium', checked ? 'text-primary-subtle-foreground' : 'text-foreground')}>{o.label}</span>
              {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** NumberInput (wheel/arrow-safe) styled like the design-system Input. */
export const FormNumberInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof NumberInput>>(
  ({ className, ...props }, ref) => (
    <NumberInput ref={ref} className={cn(controlBase, 'h-10 px-3 py-1 shadow-none md:h-9', className)} {...props} />
  ),
);
FormNumberInput.displayName = 'FormNumberInput';
