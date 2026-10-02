import React from 'react';
import SearchableSelect, { type SelectOption } from './SearchableSelect';

// Drop-in pengganti <select> bawaan: API mirip native (terima <option>/<optgroup>
// children + onChange gaya event), tapi merender dropdown custom yang rapi &
// seragam (pakai SearchableSelect). Konversi cukup rename <select> -> <Select>.
//
// Catatan: opsi dgn value "" TETAP disertakan sebagai pilihan (mis. "Semua ...")
// — tidak diperlakukan sebagai placeholder. Tombol clear (X) dimatikan bila
// tak ada opsi value "" (artinya select wajib).

interface SelectProps {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  searchable?: boolean | 'auto';
  'aria-label'?: string;
  id?: string;
  /** Diterima utk kompat drop-in <select> (styling native diabaikan — dropdown
   *  custom punya gaya sendiri). */
  style?: React.CSSProperties;
}

function collectOptions(children: React.ReactNode): { options: SelectOption[]; hasEmpty: boolean } {
  const options: SelectOption[] = [];
  let hasEmpty = false;
  const walk = (nodes: React.ReactNode, group?: string) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<any>;
      if (el.type === 'optgroup') {
        walk(el.props.children, el.props.label);
        return;
      }
      if (el.type === 'option') {
        const raw = el.props.value;
        const kids = el.props.children;
        const label = (typeof kids === 'string'
          ? kids
          : Array.isArray(kids)
            ? kids.filter((k: any) => typeof k === 'string' || typeof k === 'number').join('')
            : String(kids ?? '')).trim();
        // Native: bila atribut value tak ada, value = teks opsi.
        const val = raw === undefined ? label : String(raw);
        if (val === '') hasEmpty = true;
        options.push({ value: val, label: label || val, group });
      }
    });
  };
  walk(children);
  return { options, hasEmpty };
}

const Select: React.FC<SelectProps> = ({ value, onChange, children, className, disabled, searchable = 'auto', id, ...rest }) => {
  const { options, hasEmpty } = collectOptions(children);
  return (
    <SearchableSelect
      options={options}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(v) => onChange({ target: { value: v } })}
      disabled={disabled}
      className={className}
      searchable={searchable}
      allowClear={hasEmpty}
      aria-label={rest['aria-label'] ?? id}
    />
  );
};

export default Select;
