/**
 * Create / edit an Inventaris Kantor item (+ its photo). Same requests as
 * before: POST|PUT /ga/inventory/items, then POST|DELETE …/:id/image.
 */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Package, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { FormNumberInput, FormSection, FormSheet, InfoNote } from '@/components/inventory/master-data-kit';
import { FormSelect } from './form-select';
import { errorMessage, itemImageUrl, type GaItemRow } from './ga-inventory-model';
import { useGaCategories, useInvalidateGaInventory } from './queries';
import { Trans, useTranslation } from 'react-i18next';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface FormState {
  sku: string;
  name: string;
  categoryId: string;
  uom: string;
  minStock: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

/** Mount per open (key by item id) so the form starts fresh. */
interface GaItemFormSheetProps {
  open: boolean;
  /** null = create. */
  item: GaItemRow | null;
  onClose: () => void;
}

export function GaItemFormSheet({ open, item, onClose }: GaItemFormSheetProps) {
  const { t } = useTranslation('eam');
  const { data: categories = [] } = useGaCategories();
  const invalidate = useInvalidateGaInventory();
  const [form, setForm] = useState<FormState>(() => ({
    sku: item?.sku ?? '',
    name: item?.name ?? '',
    categoryId: '',
    uom: item?.uom ?? '',
    minStock: String(item?.minStock ?? 0),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The row carries the category code, not its id: preselect it once the
  // categories are known (the old form made the user pick it again).
  const categoryCode = item?.category?.code;
  const resolvedCategoryId = categories.find((c) => c.code === categoryCode)?.id ?? '';
  const [categoryResolved, setCategoryResolved] = useState(false);
  if (!categoryResolved && resolvedCategoryId) {
    setCategoryResolved(true);
    setForm((f) => (f.categoryId ? f : { ...f, categoryId: resolvedCategoryId }));
  }

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return toast.error(t('gaInventory.itemForm.imageSize'));
    if (!IMAGE_TYPES.includes(file.type)) return toast.error(t('gaInventory.itemForm.imageFormat'));
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.sku.trim()) e.sku = t('gaInventory.itemForm.skuRequired');
    if (!form.name.trim()) e.name = t('gaInventory.itemForm.nameRequired');
    if (!form.categoryId) e.categoryId = t('gaInventory.itemForm.categoryRequired');
    if (!form.uom.trim()) e.uom = t('gaInventory.itemForm.uomRequired');
    if (form.minStock !== '' && Number(form.minStock) < 0) e.minStock = t('gaInventory.itemForm.minNegative');
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setServerError(null);
    const body = {
      sku: form.sku,
      name: form.name,
      categoryId: form.categoryId,
      uom: form.uom,
      minStock: Number(form.minStock) || 0,
    };
    try {
      const res = item ? await api.put(`/ga/inventory/items/${item.id}`, body) : await api.post('/ga/inventory/items', body);
      const itemId = item?.id ?? (res.data as { id?: string })?.id;
      try {
        if (itemId && imageFile) {
          const fd = new FormData();
          fd.append('image', imageFile);
          await api.post(`/ga/inventory/items/${itemId}/image`, fd);
        } else if (itemId && removeImage) {
          await api.delete(`/ga/inventory/items/${itemId}/image`);
        }
      } catch {
        toast.error(t('gaInventory.itemForm.imageUploadFailed'));
      }
      toast.success(item ? t('gaInventory.itemForm.updated') : t('gaInventory.itemForm.created'));
      invalidate();
      onClose();
    } catch (err) {
      setServerError(errorMessage(err, t('gaInventory.itemForm.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const currentImage = imagePreview ?? (item?.imagePath && !removeImage ? itemImageUrl(item.id, item.imagePath) : null);

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={item ? t('gaInventory.itemForm.editTitle') : t('gaInventory.itemForm.newTitle')}
      description={item ? `${item.sku} · ${item.name}` : t('gaInventory.itemForm.newDescription')}
      error={serverError}
      saving={saving}
      submitLabel={item ? t('gaInventory.itemForm.saveChanges') : t('gaInventory.itemForm.saveItem')}
      onSubmit={submit}
    >
      <FormSection title={t('gaInventory.itemForm.identity')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('gaInventory.itemForm.sku')} required error={errors.sku}>
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t('gaInventory.itemForm.uom')} required error={errors.uom} hint={t('gaInventory.itemForm.uomHint')}>
            <Input value={form.uom} onChange={(e) => set('uom', e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label={t('gaInventory.itemForm.name')} required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('gaInventory.itemForm.category')} required error={errors.categoryId}>
            <FormSelect
              value={form.categoryId}
              onChange={(v) => set('categoryId', v)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t('gaInventory.itemForm.categoryPlaceholder')}
            />
          </Field>
          <Field label={t('gaInventory.itemForm.minStock')} error={errors.minStock} hint={t('gaInventory.itemForm.minStockHint')}>
            <FormNumberInput
              value={form.minStock}
              onChange={(e) => set('minStock', e.target.value)}
              min={0}
              step="any"
              inputMode="decimal"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title={t('gaInventory.itemForm.photo')}>
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {currentImage ? (
              <img src={currentImage} alt={t('gaInventory.itemForm.photoAlt', { name: form.name || t('gaInventory.itemForm.itemFallback') })} className="size-full object-cover" />
            ) : (
              <Package className="size-6 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_TYPES.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                pickImage(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus aria-hidden />
              {currentImage ? t('gaInventory.itemForm.changePhoto') : t('gaInventory.itemForm.pickPhoto')}
            </Button>
            {currentImage && (
              <Button type="button" variant="ghost" size="sm" className="text-danger-text" onClick={clearImage}>
                <Trash2 aria-hidden />
                {t('gaInventory.itemForm.removePhoto')}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t('gaInventory.itemForm.photoHint')}</p>
          </div>
        </div>
      </FormSection>

      {!item && (
        <InfoNote>
          <Trans t={t} i18nKey="gaInventory.itemForm.stockNote" components={{ strong: <strong /> }} />
        </InfoNote>
      )}
    </FormSheet>
  );
}
