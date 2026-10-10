import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { ComboboxField } from './overlays/ComboboxField';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

interface InquiryItem {
  id: string;
  itemName: string;
  quantity: string;       // keep as string so user can leave blank
  unit: string;
  estimatedPrice: string;
  description: string;
}

/** Channel enum values sent to the API; labels come from inquiryModal.channels.<value>. */
const CHANNELS = ['WhatsApp', 'Telepon', 'Email', 'WalkIn', 'Referral', 'Lainnya'] as const;

const UNITS = ['Kg', 'Ton', 'Sak', 'Liter', 'Pcs', 'Box', 'Unit', 'Set', 'Meter', 'Jasa'];

const newRow = (): InquiryItem => ({
  id: crypto.randomUUID(), itemName: '', quantity: '', unit: 'Kg', estimatedPrice: '', description: '',
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTarget?: any | null;
}

const InquiryModal: React.FC<Props> = ({ isOpen, onClose, editTarget }) => {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(editTarget?.id);
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState('Lainnya');
  const [partyId, setPartyId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [prospectPhone, setProspectPhone] = useState('');
  const [prospectEmail, setProspectEmail] = useState('');
  const [itemsMode, setItemsMode] = useState<'freetext' | 'structured'>('freetext');
  const [itemsText, setItemsText] = useState('');
  const [items, setItems] = useState<InquiryItem[]>([newRow()]);
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const partyPicker = usePartyPicker({ type: 'Customer', selectedId: partyId || null });

  // Sync form when modal opens / editTarget changes
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget?.id) {
      setDate(editTarget.date ? new Date(editTarget.date).toISOString().split('T')[0] : today);
      setChannel(editTarget.channel ?? 'Lainnya');
      setPartyId(editTarget.partyId ?? '');
      setProspectName(editTarget.prospectName ?? '');
      setProspectPhone(editTarget.prospectPhone ?? '');
      setProspectEmail(editTarget.prospectEmail ?? '');
      setItemsMode(editTarget.itemsMode ?? 'freetext');
      setItemsText(editTarget.itemsText ?? '');
      setItems(
        (editTarget.items ?? []).length > 0
          ? editTarget.items.map((it: any) => ({
              id: crypto.randomUUID(),
              itemName: it.itemName ?? '',
              quantity: it.quantity != null ? String(it.quantity) : '',
              unit: it.unit ?? 'Kg',
              estimatedPrice: it.estimatedPrice != null ? String(it.estimatedPrice) : '',
              description: it.description ?? '',
            }))
          : [newRow()],
      );
      setNotes(editTarget.notes ?? '');
      setFollowUpDate(editTarget.followUpDate ? new Date(editTarget.followUpDate).toISOString().split('T')[0] : '');
    } else {
      setDate(today);
      setChannel('Lainnya');
      setPartyId('');
      setProspectName('');
      setProspectPhone('');
      setProspectEmail('');
      setItemsMode('freetext');
      setItemsText('');
      setItems([newRow()]);
      setNotes('');
      setFollowUpDate('');
    }
    setError('');
    // Reset only on open or when a different record is edited; other editTarget fields are a snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id]);


  const onPickParty = (id: string) => {
    setPartyId(id);
    const p = partyPicker.parties.find((x) => x.id === id);
    if (p) {
      setProspectName(p.name);
      setProspectPhone(p.phone ?? '');
      setProspectEmail(p.email ?? '');
    }
  };

  const updateItem = (i: number, field: keyof InquiryItem, value: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/inquiries/${editTarget.id}` : '/inquiries';
      const method = isEdit ? 'put' : 'post';
      const res = await api[method](url, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? t('inquiryModal.toast.updated') : t('inquiryModal.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error ?? t('inquiryModal.errors.saveFailed')),
  });


  const handleSubmit = () => {
    setError('');
    if (!prospectName.trim()) { setError(t('inquiryModal.errors.nameRequired')); return; }

    const validItems = itemsMode === 'structured'
      ? items.filter((it) => it.itemName.trim().length > 0).map((it) => ({
          itemName: it.itemName.trim(),
          quantity: it.quantity ? Number(it.quantity) : null,
          unit: it.unit || null,
          estimatedPrice: it.estimatedPrice ? Number(it.estimatedPrice) : null,
          description: it.description || null,
        }))
      : [];

    if (itemsMode === 'structured' && validItems.length === 0 && !itemsText.trim()) {
      setError(t('inquiryModal.errors.noItems'));
      return;
    }

    mutation.mutate({
      date,
      channel,
      partyId: partyId || null,
      prospectName: prospectName.trim(),
      prospectPhone: prospectPhone.trim() || null,
      prospectEmail: prospectEmail.trim() || null,
      itemsMode,
      itemsText: itemsText.trim() || null,
      items: validItems,
      notes: notes.trim() || null,
      followUpDate: followUpDate || null,
    });
  };

  const nameError = error && error === t('inquiryModal.errors.nameRequired') ? error : undefined;
  const formError = nameError ? '' : error;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="lg" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle>
              {isEdit ? t('inquiryModal.titleEdit', { number: editTarget?.inquiryNumber ?? '' }) : t('inquiryModal.titleCreate')}
            </DialogTitle>
            <DialogDescription>
              {t('inquiryModal.description')}
            </DialogDescription>
          </OverlayHeader>

          <OverlayBody className="gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('inquiryModal.fields.date')}>
                <DateInput value={date} onChange={setDate} />
              </Field>
              <Field label={t('inquiryModal.fields.channel')}>
                {(control) => (
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c} value={c}>{t(`inquiryModal.channels.${c}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label={t('inquiryModal.fields.followUp')}>
                <DateInput value={followUpDate} onChange={setFollowUpDate} />
              </Field>
            </div>

            <div className="grid gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-1.5">
                <ComboboxField
                  label={t('inquiryModal.fields.existingCustomer')}
                  {...partyPicker.pickerProps}
                  value={partyId}
                  onChange={onPickParty}
                  placeholder={t('inquiryModal.placeholders.existingCustomer')}
                />
                {!partyId && (
                  <p className="text-xs text-warning-text">
                    {t('inquiryModal.newProspectHint')}
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('inquiryModal.fields.prospectName')} required error={nameError}>
                  <Input value={prospectName} onChange={(e) => setProspectName(e.target.value)} maxLength={200}
                    placeholder={t('inquiryModal.placeholders.prospectName')} />
                </Field>
                <Field label={t('inquiryModal.fields.phone')}>
                  <Input type="tel" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)}
                    placeholder="08xx-xxxx-xxxx" />
                </Field>
                <Field label={t('inquiryModal.fields.email')}>
                  <Input type="email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)}
                    placeholder="email@domain.com" />
                </Field>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{t('inquiryModal.items.title')}</span>
                <div role="group" aria-label={t('inquiryModal.items.modeLabel')} className="inline-flex gap-1">
                  <Button type="button" size="sm" variant={itemsMode === 'freetext' ? 'primary' : 'outline'}
                    aria-pressed={itemsMode === 'freetext'} onClick={() => setItemsMode('freetext')}>
                    {t('inquiryModal.items.freetext')}
                  </Button>
                  <Button type="button" size="sm" variant={itemsMode === 'structured' ? 'primary' : 'outline'}
                    aria-pressed={itemsMode === 'structured'} onClick={() => setItemsMode('structured')}>
                    {t('inquiryModal.items.structured')}
                  </Button>
                </div>
              </div>
              {itemsMode === 'freetext' ? (
                <Field label={t('inquiryModal.items.freetextLabel')} hideLabel>
                  <Textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={4}
                    placeholder={t('inquiryModal.items.freetextPlaceholder')} />
                </Field>
              ) : (
                <div className="grid gap-2">
                  {items.map((it, idx) => (
                    <div key={it.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-muted/20 p-2">
                      <Field label={t('inquiryModal.items.item')} className="col-span-12 md:col-span-4">
                        <Input value={it.itemName} onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                          placeholder={t('inquiryModal.items.itemPlaceholder')} />
                      </Field>
                      <Field label={t('inquiryModal.items.qty')} className="col-span-4 md:col-span-2">
                        <NumberInput value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                          className="h-10 text-right tabular-nums md:h-9" />
                      </Field>
                      <Field label={t('inquiryModal.items.unit')} className="col-span-4 md:col-span-2">
                        {(control) => (
                          <Select value={it.unit} onValueChange={(v) => updateItem(idx, 'unit', v)}>
                            <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </Field>
                      <Field label={t('inquiryModal.items.estimatedPrice')} className="col-span-4 md:col-span-3">
                        <NumberInput value={it.estimatedPrice} onChange={(e) => updateItem(idx, 'estimatedPrice', e.target.value)}
                          placeholder="0" className="h-10 text-right tabular-nums md:h-9" />
                      </Field>
                      <div className="col-span-12 flex justify-end md:col-span-1">
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon-touch"
                            className="text-danger-text md:size-9"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}
                            aria-label={t('inquiryModal.items.removeRow', { n: idx + 1 })}>
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start"
                    onClick={() => setItems([...items, newRow()])}>
                    <Plus aria-hidden /> {t('inquiryModal.items.addRow')}
                  </Button>
                </div>
              )}
            </div>

            <Field label={t('inquiryModal.fields.internalNotes')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder={t('inquiryModal.placeholders.internalNotes')} />
            </Field>

            <FormError message={formError} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('inquiryModal.actions.cancel')}</Button>
            <Button type="submit" disabled={!prospectName.trim()} loading={mutation.isPending}>
              {mutation.isPending ? t('inquiryModal.actions.saving') : isEdit ? t('inquiryModal.actions.saveChanges') : t('inquiryModal.actions.save')}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InquiryModal;
