/** New fixed asset dialog; the server generates the asset number and straight-line depreciation schedule. */
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { controlBase } from '@/components/ui/styles';
import { DateInput, Field } from '@/components/shared';
import { AccountPicker } from './AccountPicker';
import { EamAssetPicker } from './EamAssetPicker';
import { apiError } from './errors';
import type { CoaOption } from './types';

interface FixedAssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coa: readonly CoaOption[];
  coaLoading?: boolean;
}

interface FormState {
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  usefulLifeMonths: string;
  salvageValue: string;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepAccountId: string;
  description: string;
  gaAssetId: string;
}

const EMPTY: FormState = {
  name: '',
  category: '',
  acquisitionDate: '',
  acquisitionCost: '',
  usefulLifeMonths: '',
  salvageValue: '0',
  assetAccountId: '',
  depreciationAccountId: '',
  accumulatedDepAccountId: '',
  description: '',
  gaAssetId: '',
};

type Errors = Partial<Record<keyof FormState, string>>;

const numberClass = `${controlBase} h-10 px-3 md:h-9`;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = 'Nama aset wajib diisi.';
  if (!f.category.trim()) e.category = 'Kategori wajib diisi.';
  if (!f.acquisitionDate) e.acquisitionDate = 'Tanggal perolehan wajib diisi.';
  if (!(Number(f.acquisitionCost) > 0)) e.acquisitionCost = 'Harga perolehan harus lebih dari 0.';
  if (!(Number(f.usefulLifeMonths) >= 1) || !Number.isInteger(Number(f.usefulLifeMonths)))
    e.usefulLifeMonths = 'Masa manfaat minimal 1 bulan (bilangan bulat).';
  if (Number(f.salvageValue || 0) < 0) e.salvageValue = 'Nilai sisa tidak boleh negatif.';
  if (!f.assetAccountId) e.assetAccountId = 'Pilih akun aset.';
  if (!f.depreciationAccountId) e.depreciationAccountId = 'Pilih akun beban penyusutan.';
  if (!f.accumulatedDepAccountId) e.accumulatedDepAccountId = 'Pilih akun akumulasi penyusutan.';
  return e;
}

export function FixedAssetFormDialog({ open, onOpenChange, coa, coaLoading }: FixedAssetFormDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  // Reset on every open (adjust state during render, no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(EMPTY);
      setErrors({});
    }
  }

  // Asset and accumulated depreciation accounts under 1., expenses under 6.
  const assetAccounts = useMemo(() => coa.filter((a) => a.accountNumber.startsWith('1.')), [coa]);
  const expenseAccounts = useMemo(() => coa.filter((a) => a.accountNumber.startsWith('6.')), [coa]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const createMut = useMutation({
    mutationFn: async (f: FormState) =>
      (
        await api.post('/fixed-assets', {
          name: f.name.trim(),
          category: f.category.trim(),
          description: f.description.trim() || undefined,
          acquisitionDate: f.acquisitionDate,
          acquisitionCost: Number(f.acquisitionCost),
          usefulLifeMonths: Number(f.usefulLifeMonths),
          salvageValue: Number(f.salvageValue || 0),
          assetAccountId: f.assetAccountId,
          depreciationAccountId: f.depreciationAccountId,
          accumulatedDepAccountId: f.accumulatedDepAccountId,
          gaAssetId: f.gaAssetId || null,
        })
      ).data,
    onSuccess: () => {
      toast.success('Aset tetap dibuat.');
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-asset-detail'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err, 'Gagal membuat aset tetap')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length === 0) createMut.mutate(form);
  };

  const monthly =
    Number(form.acquisitionCost) > 0 && Number(form.usefulLifeMonths) > 0
      ? (Number(form.acquisitionCost) - Number(form.salvageValue || 0)) / Number(form.usefulLifeMonths)
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !createMut.isPending && onOpenChange(next)}>
      <DialogContent size="lg" hideClose={createMut.isPending}>
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Tambah Aset Tetap</DialogTitle>
            <DialogDescription>
              Jadwal penyusutan garis lurus dibuat otomatis per bulan setelah tanggal perolehan.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama aset" required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
            </Field>
            <Field label="Kategori" required error={errors.category}>
              <Input
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="Kendaraan, Mesin, Gedung, dll"
                maxLength={100}
              />
            </Field>
            <Field label="Tanggal perolehan" required error={errors.acquisitionDate}>
              {(control) => (
                <DateInput
                  id={control.id}
                  required
                  value={form.acquisitionDate}
                  onChange={(v) => set('acquisitionDate', v)}
                />
              )}
            </Field>
            <Field label="Harga perolehan (Rp)" required error={errors.acquisitionCost}>
              <NumberInput
                className={numberClass}
                min={0}
                inputMode="decimal"
                value={form.acquisitionCost}
                onChange={(e) => set('acquisitionCost', e.target.value)}
              />
            </Field>
            <Field label="Masa manfaat (bulan)" required error={errors.usefulLifeMonths}>
              <NumberInput
                className={numberClass}
                min={1}
                step={1}
                inputMode="numeric"
                value={form.usefulLifeMonths}
                onChange={(e) => set('usefulLifeMonths', e.target.value)}
              />
            </Field>
            <Field
              label="Nilai sisa (Rp)"
              error={errors.salvageValue}
              hint={monthly !== null ? `Penyusutan ± ${formatRupiah(monthly)} per bulan` : undefined}
            >
              <NumberInput
                className={numberClass}
                min={0}
                inputMode="decimal"
                value={form.salvageValue}
                onChange={(e) => set('salvageValue', e.target.value)}
              />
            </Field>
            <AccountPicker
              label="Akun aset"
              required
              value={form.assetAccountId}
              onChange={(v) => set('assetAccountId', v)}
              accounts={assetAccounts}
              loading={coaLoading}
              error={errors.assetAccountId}
            />
            <AccountPicker
              label="Akun beban penyusutan"
              required
              value={form.depreciationAccountId}
              onChange={(v) => set('depreciationAccountId', v)}
              accounts={expenseAccounts}
              loading={coaLoading}
              error={errors.depreciationAccountId}
            />
            <AccountPicker
              label="Akun akumulasi penyusutan"
              required
              value={form.accumulatedDepAccountId}
              onChange={(v) => set('accumulatedDepAccountId', v)}
              accounts={assetAccounts}
              loading={coaLoading}
              error={errors.accumulatedDepAccountId}
            />
            <Field label="Keterangan">
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={500} />
            </Field>
            <div className="sm:col-span-2">
              <EamAssetPicker value={form.gaAssetId} onChange={(v) => set('gaAssetId', v)} enabled={open} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createMut.isPending}>
              Batal
            </Button>
            <Button type="submit" loading={createMut.isPending}>
              Simpan aset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
