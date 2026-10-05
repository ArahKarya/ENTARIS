/** Periodic inspection form: checklist per category, one evidence photo per category, next due date. */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, Camera, ChevronDown, ChevronRight, ClipboardCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  CHECK_STATES,
  CHECK_STATE_META,
  FUEL_LEVELS,
  FUEL_LEVEL_LABELS,
  INSPECTION_RESULT_META,
  type CheckState,
  type InspectionCategory,
} from '../constants';
import { useInspectionCategories, useUserOptions } from '../vehicle-queries';
import { apiError, numOrNull } from '../vehicle-model';
import { ToneBadge } from '../vehicle-ui';
import { FieldRow, ModalForm, ModalShell, SelectField, TextAreaField, TextField } from './form-kit';

interface Props {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const STATE_ACTIVE: Record<CheckState, string> = {
  OK: 'border-success bg-success text-success-foreground',
  PERLU_PERHATIAN: 'border-warning bg-warning text-warning-foreground',
  RUSAK: 'border-danger bg-danger text-danger-foreground',
};

function worstState(cat: InspectionCategory, checklist: Record<string, CheckState>): CheckState | null {
  if (cat.items.some((it) => checklist[it.key] === 'RUSAK')) return 'RUSAK';
  if (cat.items.some((it) => checklist[it.key] === 'PERLU_PERHATIAN')) return 'PERLU_PERHATIAN';
  return cat.items.some((it) => checklist[it.key]) ? 'OK' : null;
}

export function InspectionModal({ assetId, onClose, onSaved }: Props) {
  const categories = useInspectionCategories();
  const { data: users = [] } = useUserOptions('ga-users-inspector-picker');

  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [inspectorUserId, setInspectorUserId] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [intervalDays, setIntervalDays] = useState('30');
  const [checklist, setChecklist] = useState<Record<string, CheckState>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, { file: File; preview: string }>>({});

  // First category starts open so the user sees the checklist right away.
  const isCatOpen = (key: string) => openCats[key] ?? key === categories[0]?.key;

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);
  const filledCount = Object.keys(checklist).length;

  const overallResult = useMemo(() => {
    const values = Object.values(checklist);
    if (values.some((v) => v === 'RUSAK')) return 'TIDAK_LAYAK';
    if (values.some((v) => v === 'PERLU_PERHATIAN')) return 'PERLU_PERHATIAN';
    return 'BAIK';
  }, [checklist]);

  const nextDueDate = useMemo(() => {
    if (!tanggal) return '';
    const days = Number(intervalDays);
    if (!Number.isFinite(days) || days <= 0) return '';
    const d = new Date(tanggal);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [tanggal, intervalDays]);

  const mut = useMutation({
    mutationFn: async () => {
      const created = await api.post(`/ga/vehicle/assets/${assetId}/inspections`, {
        tanggal,
        odometer: numOrNull(odometer),
        checklist,
        overallResult,
        notes: notes || null,
        inspectorUserId: inspectorUserId || null,
        inspectorName: inspectorName || (users.find((u) => u.id === inspectorUserId)?.fullName ?? null),
        fuelLevel: fuelLevel || null,
        intervalDays: numOrNull(intervalDays),
        nextDueDate: nextDueDate || null,
      });
      // Photos need the inspection id, so they upload after it is saved.
      const inspectionId = created.data?.id;
      const entries = Object.entries(photos);
      if (inspectionId && entries.length > 0) {
        let failed = 0;
        for (const [category, { file }] of entries) {
          try {
            const fd = new FormData();
            fd.append('photo', file);
            fd.append('category', category);
            // Let axios set the multipart boundary.
            await api.post(`/ga/vehicle/assets/${assetId}/inspections/${inspectionId}/photos`, fd);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) toast.warning(`${failed} foto gagal diunggah. Inspeksi tetap tersimpan.`);
      }
      return created;
    },
    onSuccess: () => {
      toast.success('Inspeksi disimpan.');
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal simpan inspeksi.')),
  });

  const setPoint = (key: string, value: CheckState) => setChecklist((prev) => ({ ...prev, [key]: value }));
  const setCategoryAll = (cat: InspectionCategory, value: CheckState) =>
    setChecklist((prev) => ({ ...prev, ...Object.fromEntries(cat.items.map((it) => [it.key, value])) }));

  const pickPhoto = (category: string, f: File | null) => {
    if (!f) {
      setPhotos((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== category)));
      return;
    }
    if (!PHOTO_TYPES.includes(f.type)) {
      toast.error('Format foto harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > MAX_PHOTO_BYTES) {
      toast.error('Ukuran foto maksimal 5 MB.');
      return;
    }
    setPhotos((prev) => ({ ...prev, [category]: { file: f, preview: URL.createObjectURL(f) } }));
  };

  const result = INSPECTION_RESULT_META[overallResult]!;

  return (
    <ModalShell title="Inspeksi Berkala" icon={ClipboardCheck} onClose={onClose} wide>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={mut.isPending}
        submitDisabled={!tanggal || filledCount === 0}
      >
        <FieldRow cols={4}>
          <TextField label="Tanggal" type="date" value={tanggal} onChange={setTanggal} required />
          <TextField label="Odometer (km)" type="number" value={odometer} onChange={setOdometer} />
          <SelectField label="Level BBM" value={fuelLevel} onChange={setFuelLevel} options={FUEL_LEVELS} labels={FUEL_LEVEL_LABELS} emptyLabel="— Pilih —" />
          <TextField label="Interval (hari)" type="number" value={intervalDays} onChange={setIntervalDays} inputMode="numeric" />
        </FieldRow>
        <FieldRow>
          <ComboboxField
              label="Inspektor"
              value={inspectorUserId}
              onChange={(v: string) => {
                setInspectorUserId(v);
                setInspectorName(users.find((u) => u.id === v)?.fullName ?? '');
              }}
              options={users.map((u) => ({ value: u.id, label: u.fullName }))}
              placeholder="Pilih inspektor…"
            />
          <TextField label="Nama inspektor (bila di luar daftar user)" value={inspectorName} onChange={setInspectorName} />
        </FieldRow>

        <p className="flex items-center gap-2 rounded-md bg-info-subtle px-3 py-2 text-xs text-info-text">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          Jadwal inspeksi berikutnya: <strong className="num">{nextDueDate ? formatDate(nextDueDate) : '-'}</strong>
        </p>

        <fieldset className="space-y-2">
          <legend className="flex w-full items-center justify-between pb-1 text-sm font-medium text-foreground">
            Checklist komponen
            <span className="num text-xs font-normal text-muted-foreground">
              {filledCount}/{allItems.length} terisi
            </span>
          </legend>
          {categories.map((cat) => {
            const isOpen = isCatOpen(cat.key);
            const catFilled = cat.items.filter((it) => checklist[it.key]).length;
            const worst = worstState(cat, checklist);
            const panelId = `insp-cat-${cat.key}`;
            return (
              <div key={cat.key} className="overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenCats((prev) => ({ ...prev, [cat.key]: !isCatOpen(cat.key) }))}
                  className="flex w-full items-center justify-between gap-2 bg-muted px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {isOpen ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
                    {cat.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {worst && <ToneBadge {...CHECK_STATE_META[worst]!} />}
                    <span className="num text-xs text-muted-foreground">
                      {catFilled}/{cat.items.length}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div id={panelId} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Tandai semua:</span>
                      {CHECK_STATES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCategoryAll(cat, v)}
                          className="rounded-sm border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {CHECK_STATE_META[v]!.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {cat.items.map((it) => (
                        <div
                          key={it.key}
                          role="radiogroup"
                          aria-label={it.label}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <span className="text-sm text-foreground">{it.label}</span>
                          <div className="flex items-center gap-1">
                            {CHECK_STATES.map((v) => {
                              const on = checklist[it.key] === v;
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => setPoint(it.key, v)}
                                  className={cn(
                                    'rounded-sm border px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    on ? STATE_ACTIVE[v] : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                                  )}
                                >
                                  {CHECK_STATE_META[v]!.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1">
                      {photos[cat.key] ? (
                        <div className="flex items-center gap-3">
                          <div className="relative inline-block">
                            <img src={photos[cat.key]!.preview} alt={`Foto ${cat.label}`} className="h-20 rounded-md border border-border object-cover" />
                            <button
                              type="button"
                              onClick={() => pickPhoto(cat.key, null)}
                              aria-label={`Batalkan foto ${cat.label}`}
                              className="absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background hover:bg-danger"
                            >
                              <X className="size-3.5" aria-hidden />
                            </button>
                          </div>
                          <span className="text-xs text-muted-foreground">Foto diunggah setelah inspeksi disimpan.</span>
                        </div>
                      ) : (
                        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-xs text-muted-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                          <Camera className="size-4" aria-hidden />
                          Foto bukti {cat.label} (opsional, maks 5 MB)
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={(e) => pickPhoto(cat.key, e.target.files?.[0] ?? null)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Hasil keseluruhan:</span>
          <ToneBadge label={result.label} tone={result.tone} />
        </div>
        <TextAreaField label="Catatan" value={notes} onChange={setNotes} />
      </ModalForm>
    </ModalShell>
  );
}
