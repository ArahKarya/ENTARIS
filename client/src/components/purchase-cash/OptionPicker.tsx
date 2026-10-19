/**
 * Single-select for forms: Radix Select for short lists, cmdk combobox for long or
 * `searchable` ones. Works inside Dialog/Sheet, unlike SearchableSelect.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { controlBase } from '@/components/ui/styles';
import { cn } from '@/lib/utils';

export interface PickerOption {
  value: string;
  label: string;
  /** Secondary text, also searched. */
  hint?: string;
  disabled?: boolean;
  /** Group heading (combobox only); options with a group always use the combobox. */
  group?: string;
}

interface OptionPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  /** Adds a selectable "" option with this label (e.g. "Semua gudang"). */
  emptyLabel?: string;
  disabled?: boolean;
  searchable?: boolean | 'auto';
  className?: string;
  /** Server-side search: always a combobox, no local filtering, each keystroke reported. */
  onSearchChange?: (query: string) => void;
  /** Shown in the empty state while options load. */
  loading?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-required'?: boolean | 'true' | 'false';
}

const EMPTY = '__empty__';

export function OptionPicker({
  id,
  value,
  onChange,
  options,
  placeholder: placeholderProp,
  emptyLabel,
  disabled,
  searchable = 'auto',
  className,
  onSearchChange,
  loading,
  ...aria
}: OptionPickerProps) {
  const { t } = useTranslation('purchasing');
  const placeholder = placeholderProp ?? t('shared.selectPlaceholder');
  const serverSearch = !!onSearchChange;
  const showSearch =
    serverSearch || (searchable === 'auto' ? options.length > 7 || options.some((o) => o.group) : searchable);
  const popupId = useId();
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const setOpen = (next: boolean) => {
    setOpenState(next);
    // Reset the server search when the popup closes.
    if (!next && serverSearch && query) {
      setQuery('');
      onSearchChange('');
    }
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    onSearchChange?.(next);
  };

  if (!showSearch) {
    return (
      <Select
        value={value === '' ? (emptyLabel || options.some((o) => o.value === '') ? EMPTY : '') : value}
        onValueChange={(v) => onChange(v === EMPTY ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={className} {...aria}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value || EMPTY} value={o.value === '' ? EMPTY : o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const selected = options.find((o) => o.value === value);
  const groups: Array<[string | undefined, PickerOption[]]> = [];
  for (const o of options) {
    const found = groups.find(([g]) => g === o.group);
    if (found) found[1].push(o);
    else groups.push([o.group, [o]]);
  }
  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const itemClass =
    'flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)] data-[disabled=true]:opacity-50';

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={popupId}
          aria-haspopup="listbox"
          disabled={disabled}
          {...aria}
          className={cn(controlBase, 'flex h-10 items-center justify-between gap-2 px-3 text-left md:h-9', className)}
        >
          <span className={cn('truncate', !selected && !(value === '' && emptyLabel) && 'text-muted-foreground')}>
            {selected?.label ?? (value === '' && emptyLabel ? emptyLabel : placeholder)}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={popupId}
          align="start"
          sideOffset={4}
          className="z-[var(--z-popover)] w-[max(var(--radix-popover-trigger-width),16rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--shadow-2)]"
        >
          <Command label={aria['aria-label'] ?? placeholder} loop shouldFilter={!serverSearch}>
            <div className="flex items-center gap-2 border-b border-border px-3 focus-within:shadow-[inset_0_-2px_0_var(--ring)]">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input
                aria-label={t('shared.searchOptions')}
                placeholder={t('shared.searchPlaceholder')}
                {...(serverSearch ? { value: query, onValueChange: changeQuery } : {})}
                className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
              />
            </div>
            <Command.List className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                {loading ? t('shared.loading') : t('shared.notFound')}
              </Command.Empty>
              {emptyLabel && (
                <Command.Item value={`__empty ${emptyLabel}`} onSelect={() => choose('')} className={itemClass}>
                  <Check className={cn('size-4', value === '' ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  {emptyLabel}
                </Command.Item>
              )}
              {groups.map(([heading, items]) => {
                const rendered = items.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ''} ${o.value}`}
                    onSelect={() => choose(o.value)}
                    disabled={o.disabled}
                    className={itemClass}
                  >
                    <Check className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                  </Command.Item>
                ));
                return heading ? (
                  <Command.Group
                    key={heading}
                    heading={heading}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {rendered}
                  </Command.Group>
                ) : (
                  rendered
                );
              })}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
