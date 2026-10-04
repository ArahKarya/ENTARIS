/**
 * Edit asset metadata (name, category, description). Amounts, useful life and
 * GL accounts stay locked — correcting those means disposing the asset and
 * creating a new one, so related journals stay consistent (server rule).
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared';
import { apiError } from './errors';
import type { FixedAssetRow } from './types';

interface FixedAssetEditDialogProps {
  asset: FixedAssetRow | null;
  onClose: () => void;
}

export function FixedAssetEditDialog({ asset, onClose }: FixedAssetEditDialogProps) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  // Load the asset's values whenever another asset is opened (no effect needed).
  const [loaded, setLoaded] = useState<FixedAssetRow | null>(null);
  if (asset !== loaded) {
    setLoaded(asset);
    if (asset) {
      setName(asset.name);
      setCategory(asset.category);
      setDescription(asset.description ?? '');
      setErrors({});
    }
  }

  const editMut = useMutation({
    mutationFn: async (data: { id: string; name: string; category: string; description: string | null }) =>
      (
        await api.put(`/fixed-assets/${data.id}`, {
          name: data.name,
          category: data.category,
          description: data.description,
        })
      ).data,
    onSuccess: () => {
      toast.success('Aset diperbarui');
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'Gagal mengupdate aset')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    const found = {
      name: name.trim() ? undefined : 'Nama wajib diisi.',
      category: category.trim() ? undefined : 'Kategori wajib diisi.',
    };
    setErrors(found);
    if (found.name || found.category) return;
    editMut.mutate({ id: asset.id, name, category, description: description ? description : null });
  };

  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && !editMut.isPending && onClose()}>
      <DialogContent size="md" hideClose={editMut.isPending}>
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Edit Data Aset</DialogTitle>
            <DialogDescription className="num font-mono">{asset?.assetNumber}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Nama" required error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Kategori" required error={errors.category}>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} />
            </Field>
            <Field label="Keterangan">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
            </Field>
            <div className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2.5 text-xs text-info-text">
              <Info className="mt-px size-4 shrink-0" aria-hidden />
              <p>
                Hanya nama, kategori, dan keterangan yang bisa diubah. Untuk koreksi nominal (harga perolehan, masa
                manfaat, akun GL), lepas aset lama lalu buat aset baru — supaya jurnal terkait tetap konsisten.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={editMut.isPending}>
              Batal
            </Button>
            <Button type="submit" loading={editMut.isPending}>
              Simpan perubahan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
