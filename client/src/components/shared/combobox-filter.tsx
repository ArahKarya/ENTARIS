import { useId, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { controlBase } from '@/components/ui/styles';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text (code, city…), also searched. */
  hint?: string;
}

export interface ComboboxFilterProps {
  /** Visible to screen readers only; also used as the dialog name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Shown when nothing is selected, e.g. "Semua pelanggan". */
  allLabel: string;
  searchPlaceholder?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Searchable single-select for filter bars (Radix Popover + cmdk).
 * Empty value means "all"; the × clears it.
 */
export function ComboboxFilter({
  label,
  value,
  onChange,
  options,
  allLabel,
  searchPlaceholder = 'Cari…',
  loading,
  className,
}: ComboboxFilterProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-popup`}
            aria-haspopup="listbox"
            className={cn(
              controlBase,
              'flex h-10 items-center justify-between gap-2 px-3 text-left md:h-9',
              value && 'pr-9',
            )}
          >
            <span className="truncate">
              {selected?.label ?? (value ? '…' : allLabel)}
            </span>
            {!value && <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            id={`${id}-popup`}
            align="start"
            sideOffset={4}
            aria-label={label}
            className={cn(
              'z-[var(--z-popover)] w-[max(var(--radix-popover-trigger-width),16rem)] overflow-hidden rounded-lg border border-border',
              'bg-popover text-popover-foreground shadow-[var(--shadow-2)]',
            )}
          >
            <Command label={label} loop>
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Command.Input
                  placeholder={searchPlaceholder}
                  className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>
              <Command.List className="max-h-72 overflow-y-auto p-1">
                <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {loading ? 'Memuat…' : 'Tidak ditemukan.'}
                </Command.Empty>
                <Command.Item
                  value={`__all__ ${allLabel}`}
                  onSelect={() => choose('')}
                  className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} aria-hidden />
                  {allLabel}
                </Command.Item>
                {options.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ''} ${o.value}`}
                    onSelect={() => choose(o.value)}
                    className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                  >
                    <Check className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={`Hapus filter ${label.toLowerCase()}`}
          className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
