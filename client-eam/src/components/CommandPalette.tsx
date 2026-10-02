import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Users, FileText, CreditCard, BookOpen, List, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  party: 'Mitra',
  sales: 'Invoice Penjualan',
  purchase: 'Invoice Pembelian',
  payment: 'Pembayaran',
  journal: 'Jurnal',
  account: 'Akun',
};

const typeIcons: Record<string, typeof Users> = {
  party: Users,
  sales: FileText,
  purchase: FileText,
  payment: CreditCard,
  journal: BookOpen,
  account: List,
};

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/search', { params: { q, limit: 15 } });
      setResults(res.data);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      navigate(results[selectedIndex].url);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  // Flat list for index tracking
  const flatResults = Object.values(grouped).flat();

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-[calc(100vw-1rem)] sm:max-w-lg rounded-xl shadow-2xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Search size={18} style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari invoice, mitra, jurnal..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--color-text-primary)' }}
          />
          {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Ketik minimal 2 karakter untuk mencari...
            </div>
          )}

          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Tidak ada hasil untuk &quot;{query}&quot;
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                {typeLabels[type] || type}
              </div>
              {items.map((item) => {
                const globalIdx = flatResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = typeIcons[item.type] || FileText;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--color-hover)' : 'transparent',
                      color: 'var(--color-text-primary)',
                    }}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    onClick={() => { navigate(item.url); onClose(); }}
                  >
                    <Icon size={16} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t flex items-center gap-4 text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          <span>
            <kbd className="px-1 py-0.5 rounded border text-xs font-mono"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
            >&uarr;&darr;</kbd> navigasi
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border text-xs font-mono"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
            >Enter</kbd> pilih
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border text-xs font-mono"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}
            >Esc</kbd> tutup
          </span>
        </div>
      </div>
    </div>
  );
}
