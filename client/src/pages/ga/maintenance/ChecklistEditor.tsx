import { Plus, Trash2 } from 'lucide-react';

// Dynamic checklist editor used inside the Complete Work Order modal.
// Mirrors the backend `checklist` schema: array of { id, label, required, done, notes }.
// Backend rejects completion if any `required && !done` item exists.

export type ChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  done: boolean;
  notes: string;
};

const fieldClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500';

const newItem = (): ChecklistItem => ({
  id: crypto.randomUUID(),
  label: '',
  required: false,
  done: false,
  notes: '',
});

export const ChecklistEditor = ({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) => {
  const update = (id: string, patch: Partial<ChecklistItem>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">Belum ada item checklist.</p>
      ) : (
        items.map((it) => (
          <div key={it.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <input
                className={fieldClass}
                placeholder="Item checklist (mis. Cek tekanan oli)"
                value={it.label}
                onChange={(e) => update(it.id, { label: e.target.value })}
              />
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="mt-1.5 p-1.5 text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                aria-label="Hapus item"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={it.required}
                  onChange={(e) => update(it.id, { required: e.target.checked })}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                Wajib
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={(e) => update(it.id, { done: e.target.checked })}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                Selesai
              </label>
            </div>
            <input
              className={fieldClass}
              placeholder="Catatan (opsional)"
              value={it.notes}
              onChange={(e) => update(it.id, { notes: e.target.value })}
            />
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700"
      >
        <Plus size={14} /> Tambah item checklist
      </button>
    </div>
  );
};
