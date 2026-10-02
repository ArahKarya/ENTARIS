import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['Ctrl+K', '\u2318K'], action: 'Pencarian global' },
  { keys: ['Ctrl+N', '\u2318N'], action: 'Buat baru' },
  { keys: ['Escape'], action: 'Tutup dialog' },
  { keys: ['?'], action: 'Tampilkan bantuan pintasan' },
];

export function ShortcutHelp({ isOpen, onClose }: ShortcutHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md rounded-xl shadow-xl border"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-primary)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-base font-semibold">Pintasan Keyboard</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Shortcuts Table */}
        <div className="px-5 py-4 space-y-3">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {shortcut.action}
              </span>
              <div className="flex items-center gap-1.5">
                {shortcut.keys.map((key, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="text-xs mx-1" style={{ color: 'var(--color-text-muted)' }}>/</span>
                    )}
                    <kbd
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border"
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          Tekan <kbd className="px-1.5 py-0.5 rounded border text-xs font-mono" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}>Esc</kbd> untuk menutup
        </div>
      </div>
    </div>
  );
}
