import { useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type DateInputProps = {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  min?: string;
  max?: string;
};

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function displayToIso(display: string): string {
  const parts = display.split('/');
  if (parts.length !== 3) return '';
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return '';
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return '';
  if (month < 1 || month > 12) return '';
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return '';
  }
  return `${yyyy}-${mm}-${dd}`;
}

function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({
  id,
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  disabled,
  className,
  required,
  min,
  max,
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [prevValue, setPrevValue] = useState(value);
  const nativeRef = useRef<HTMLInputElement>(null);

  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== displayToIso(display)) {
      setDisplay(isoToDisplay(value));
    }
  }

  function handleChange(raw: string) {
    const formatted = autoFormat(raw);
    setDisplay(formatted);
    const iso = displayToIso(formatted);
    if (iso !== value) {
      onChange(iso);
    }
  }

  function openNativePicker() {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        el.focus();
      }
    } else {
      el.focus();
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        required={required}
        autoComplete="off"
        maxLength={10}
        className="pr-9"
      />
      <button
        type="button"
        onClick={openNativePicker}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Pilih tanggal"
        tabIndex={-1}
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        value={value}
        onChange={(e) => {
          const iso = e.target.value;
          setDisplay(isoToDisplay(iso));
          onChange(iso);
        }}
        min={min}
        max={max}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-0 opacity-0"
      />
    </div>
  );
}
