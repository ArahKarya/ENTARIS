import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Tampilkan kotak pencarian. 'auto' = hanya bila opsi banyak (>7). */
  searchable?: boolean | 'auto';
  /** Tampilkan tombol clear (X). Mati untuk select wajib (tanpa opsi kosong). */
  allowClear?: boolean;
  /** Accessible label for the combobox. Falls back to the placeholder. */
  'aria-label'?: string;
}

// Stable IDs so aria-controls / aria-activedescendant point at real DOM ids.
let comboboxIdSeq = 0;

const SearchableSelect = ({ options, value, onChange, placeholder = '— Pilih —', disabled = false, className = '', searchable = 'auto', allowClear = true, 'aria-label': ariaLabel }: Props) => {
  const showSearch = searchable === 'auto' ? options.length > 7 : searchable;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>('');
  if (!idRef.current) {
    comboboxIdSeq += 1;
    idRef.current = `cbx-${comboboxIdSeq}`;
  }
  const listboxId = `${idRef.current}-list`;
  const optionId = (idx: number) => `${idRef.current}-opt-${idx}`;

  const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.group ?? '').toLowerCase().includes(q));
  }, [options, search]);

  // Group filtered options
  const grouped = useMemo(() => {
    const hasGroups = filtered.some((o) => !!o.group);
    if (!hasGroups) return [{ group: '', items: filtered }];
    const map = new Map<string, SelectOption[]>();
    for (const o of filtered) {
      const g = o.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatFiltered = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setHighlightIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIdx(-1);
  }, []);

  const select = useCallback((val: string) => {
    onChange(val);
    close();
  }, [onChange, close]);

  // Close on click outside (allow clicks inside the portalled menu)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      close();
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, close]);

  // Position menu via fixed coords so it isn't clipped by parent overflow
  useEffect(() => {
    if (!isOpen) { setMenuRect(null); return; }
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const MENU_MAX = 240;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < MENU_MAX && r.top > spaceBelow;
      setMenuRect({
        top: openUp ? r.top - 4 : r.bottom + 4,
        left: r.left,
        width: r.width,
        openUp,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < flatFiltered.length) {
        select(flatFiltered[highlightIdx].value);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      {(!isOpen || !showSearch) ? (
        <button
          type="button"
          onClick={() => (isOpen ? close() : open())}
          disabled={disabled}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-label={ariaLabel ?? placeholder}
          className={`w-full flex items-center justify-between border rounded-lg py-2 px-3 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${isOpen ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200'}`}
        >
          <span className={selectedOption ? 'text-gray-900 truncate' : 'text-gray-400 truncate'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {allowClear && value && !disabled && (
              <span
                role="button"
                aria-label="Hapus pilihan"
                onClick={(e) => { e.stopPropagation(); onChange(''); }}
                className="p-0.5 hover:bg-gray-100 rounded"
              >
                <X size={12} className="text-gray-400" />
              </span>
            )}
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>
      ) : (
        <div className="w-full flex items-center border border-blue-500 ring-2 ring-blue-500 rounded-lg py-2 px-3 bg-white">
          <Search size={14} className="text-gray-400 flex-shrink-0 mr-2" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Ketik untuk mencari..."
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={true}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={highlightIdx >= 0 ? optionId(highlightIdx) : undefined}
            aria-label={ariaLabel ?? placeholder}
            className="w-full text-sm text-gray-900 outline-none bg-transparent"
          />
        </div>
      )}

      {/* Dropdown — portalled to body so parent overflow can't clip it */}
      {isOpen && menuRect && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? placeholder}
          style={{
            position: 'fixed',
            top: menuRect.openUp ? undefined : menuRect.top,
            bottom: menuRect.openUp ? window.innerHeight - menuRect.top : undefined,
            left: menuRect.left,
            width: menuRect.width,
            maxHeight: 240,
          }}
          className="z-[200] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          {flatFiltered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">Tidak ditemukan</div>
          ) : (
            grouped.map((g) => (
              <div key={g.group}>
                {g.group && (
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-widest bg-gray-50 sticky top-0">
                    {g.group}
                  </div>
                )}
                {g.items.map((opt) => {
                  const idx = flatFiltered.indexOf(opt);
                  const isSelected = opt.value === value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <div
                      key={opt.value}
                      id={optionId(idx)}
                      data-idx={idx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => select(opt.value)}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-blue-50 text-blue-900' :
                        isSelected ? 'bg-gray-50 text-gray-900 font-medium' :
                        'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default SearchableSelect;
