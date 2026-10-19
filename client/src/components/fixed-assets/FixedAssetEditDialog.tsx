/**
 * Edit asset metadata (name, category, description, linked EAM asset). Amounts, useful life and
 * GL accounts stay locked — correcting those means disposing the asset and
 * creating a new one, so related journals stay consistent (server rule).
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared';
import { EamAssetPicker } from './EamAssetPicker';
import { apiError } from './errors';
import type { FixedAssetRow } from './types';

interface FixedAssetEditDialogProps {
  asset: FixedAssetRow | null;
  onClose: () => void;
}

export function FixedAssetEditDialog({ asset, onClose }: FixedAssetEditDialogProps) {
  const { t } = useTranslation('finance');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [gaAssetId, setGaAssetId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  // Load the asset's values whenever another asset is opened (no effect needed).
  const [loaded, setLoaded] = useState<FixedAssetRow | null>(null);
  if (asset !== loaded) {
    setLoaded(asset);
    if (asset) {
      setName(asset.name);
      setCategory(asset.category);
      setDescription(asset.description ?? '');
      setGaAssetId(asset.gaAssetId ?? asset.gaAsset?.id ?? '');
      setErrors({});
    }
  }

  const editMut = useMutation({
    mutationFn: async (data: {
      id: string;
      name: string;
      category: string;
      description: string | null;
      gaAssetId: string | null;
    }) =>
      (
        await api.put(`/fixed-assets/${data.id}`, {
          name: data.name,
          category: data.category,
          description: data.description,
          gaAssetId: data.gaAssetId,
        })
      ).data,
    onSuccess: () => {
      toast.success(t('fixedAssetEditDialog.updated'));
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-assets'] });
      qc.invalidateQueries({ queryKey: ['ga-asset-detail'] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err, t('fixedAssetEditDialog.updateFailed'))),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    const found = {
      name: name.trim() ? undefined : t('fixedAssetEditDialog.errors.name'),
      category: category.trim() ? undefined : t('fixedAssetEditDialog.errors.category'),
    };
    setErrors(found);
    if (found.name || found.category) return;
    editMut.mutate({
      id: asset.id,
      name,
      category,
      description: description ? description : null,
      gaAssetId: gaAssetId || null,
    });
  };

  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && !editMut.isPending && onClose()}>
      <DialogContent size="md" hideClose={editMut.isPending}>
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t('fixedAssetEditDialog.title')}</DialogTitle>
            <DialogDescription className="num font-mono">{asset?.assetNumber}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label={t('fixedAssetEditDialog.name')} required error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </Field>
            <Field label={t('fixedAssetEditDialog.category')} required error={errors.category}>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} />
            </Field>
            <Field label={t('fixedAssetEditDialog.description')}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
            </Field>
            <EamAssetPicker
              value={gaAssetId}
              onChange={setGaAssetId}
              selfId={asset?.id}
              current={asset?.gaAsset ?? null}
              enabled={asset !== null}
            />
            <div className="flex items-start gap-2 rounded-md bg-info-subtle px-3 py-2.5 text-xs text-info-text">
              <Info className="mt-px size-4 shrink-0" aria-hidden />
              <p>
                {t('fixedAssetEditDialog.lockedNote')}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={editMut.isPending}>
              {t('fixedAssetEditDialog.cancel')}
            </Button>
            <Button type="submit" loading={editMut.isPending}>
              {t('fixedAssetEditDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
