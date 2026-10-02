import React, { useState, useEffect } from 'react';

interface Props {
  /** Numeric value in plain rupiah (e.g. 5000000). The component keeps its own
   *  display state; whenever this prop changes externally, the display syncs. */
  value: number;
  /** Called with the parsed numeric value on every keystroke. */
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Allow negative input (default false). */
  allowNegative?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}

/**
 * Currency input with live `.`-separated thousand grouping. Renders the value
 * as `5.000.000` while the user types, parses cleanly back to `5000000` on
 * every keystroke via onChange. Replaces error-prone `type="number"` inputs
 * for IDR amounts where users routinely lose track of zero counts.
 */
export const RupiahInput: React.FC<Props> = ({
  value,
  onChange,
  placeholder = '0',
  className = '',
  disabled = false,
  readOnly = false,
  allowNegative = false,
  id,
  name,
  'aria-label': ariaLabel,
  onBlur,
  onFocus,
  autoFocus,
}) => {
  const format = (n: number): string => {
    if (!n && n !== 0) return '';
    if (n === 0) return '';
    return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  const [display, setDisplay] = useState<string>(() => format(value));

  // Sync when external value changes (e.g. parent resets form)
  useEffect(() => {
    setDisplay(format(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      setDisplay(raw);
      onChange(0);
      return;
    }
    // Strip everything except digits (and leading minus when allowed).
    const cleaned = allowNegative
      ? raw.replace(/(?!^-)[^0-9]/g, '')
      : raw.replace(/[^0-9]/g, '');
    const num = Number(cleaned);
    if (isNaN(num)) return;
    setDisplay(format(num));
    onChange(num);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      name={name}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      className={className}
    />
  );
};

export default RupiahInput;
