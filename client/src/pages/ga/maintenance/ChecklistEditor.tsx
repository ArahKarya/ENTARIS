import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

const newItem = (): ChecklistItem => ({
  id: crypto.randomUUID(),
  label: '',
  required: false,
  done: false,
  notes: '',
});

const checkboxClass = 'size-4 rounded border-input accent-[var(--primary)]';

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
        <p className="text-sm text-muted-foreground">Belum ada item checklist.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, idx) => (
            <li key={it.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-start gap-2">
                <Input
                  aria-label={`Item checklist ${idx + 1}`}
                  placeholder="Item checklist (mis. Cek tekanan oli)"
                  value={it.label}
                  onChange={(e) => update(it.id, { label: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(it.id)}
                  aria-label={`Hapus item checklist ${idx + 1}`}
                  className="shrink-0 text-danger-text hover:bg-danger-subtle"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={it.required}
                    onChange={(e) => update(it.id, { required: e.target.checked })}
                    className={checkboxClass}
                  />
                  Wajib
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={(e) => update(it.id, { done: e.target.checked })}
                    className={checkboxClass}
                  />
                  Selesai
                </label>
              </div>
              <Input
                aria-label={`Catatan item checklist ${idx + 1}`}
                placeholder="Catatan (opsional)"
                value={it.notes}
                onChange={(e) => update(it.id, { notes: e.target.value })}
              />
            </li>
          ))}
        </ol>
      )}
      <Button variant="secondary" size="sm" onClick={() => onChange([...items, newItem()])}>
        <Plus aria-hidden /> Tambah item checklist
      </Button>
    </div>
  );
};
