import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { ShieldCheck } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import RupiahInput from './RupiahInput';
import SearchableSelect from './SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass, moneyInputClass } from './sales/dialog-classes-b';

const GUARANTEE_TYPES = ['Penawaran', 'Pelaksanaan', 'Pemeliharaan', 'Lainnya'];

interface ProjectGuaranteeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProjectGuaranteeModal: React.FC<ProjectGuaranteeModalProps> = ({ isOpen, onClose }) => {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [guaranteeType, setGuaranteeType] = useState('Penawaran');
  const [projectName, setProjectName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setPartyId('');
      setGuaranteeType('Penawaran');
      setProjectName('');
      setReferenceNo('');
      setAmount('');
      setAccountId('');
      setExpectedReturnDate('');
      setNotes('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Pemberi proyek bisa customer atau pihak lain — tampilkan semua pihak.
  const { data: parties } = useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await api.get('/parties');
      return res.data.data ?? res.data;
    },
    enabled: isOpen,
  });

  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/project-guarantees', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan uang jaminan.'),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && projectName.trim() && numAmount > 0 && accountId && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      guaranteeType,
      projectName: projectName.trim(),
      referenceNo: referenceNo || null,
      amount: numAmount,
      accountId,
      expectedReturnDate: expectedReturnDate || null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success-text" aria-hidden />
              Setor Uang Jaminan Proyek
            </DialogTitle>
            <DialogDescription>Jaminan tender/pelaksanaan ke pemberi proyek</DialogDescription>
          </OverlayHeader>

          <OverlayBody className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tanggal Setor">
                <DateInput value={date} onChange={setDate} />
              </Field>
              <Field label="Jenis Jaminan">
                {(control) => (
                  <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                    <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GUARANTEE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label required>Pemberi Proyek</Label>
              <SearchableSelect
                options={(parties ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                value={partyId}
                onChange={setPartyId}
                placeholder="— Pilih Pihak —"
                aria-label="Pemberi proyek"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama Proyek" required>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Mis. Pengadaan Beras 2026" />
              </Field>
              <Field label="No. Referensi">
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="No. tender / kontrak" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jumlah (Rp)" required>
                {(control) => (
                  <RupiahInput
                    id={control.id}
                    value={typeof amount === 'number' ? amount : 0}
                    onChange={(v) => setAmount(v === 0 ? '' : v)}
                    placeholder="0"
                    className={moneyInputClass}
                    aria-label="Jumlah uang jaminan"
                  />
                )}
              </Field>
              <Field label="Akun Sumber Dana" required>
                {(control) => (
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger {...control}><SelectValue placeholder="— Pilih Akun Kas/Bank —" /></SelectTrigger>
                    <SelectContent>
                      {cashAccounts?.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.accountNumber} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jatuh Tempo Pengembalian" hint="Opsional — sistem mengingatkan H-7 via notifikasi & Telegram.">
                <DateInput value={expectedReturnDate} onChange={setExpectedReturnDate} />
              </Field>
              <Field label="Catatan">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan opsional..." />
              </Field>
            </div>

            {numAmount > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3" aria-live="polite">
                <p className="text-xs font-medium text-foreground">
                  Setor jaminan <span className="text-base font-bold tabular-nums">{formatRupiah(numAmount)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Jurnal: <span className="font-mono">DR Uang Jaminan Proyek (1.8) / CR Kas-Bank</span>
                </p>
              </div>
            )}

            <FormError message={error} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
              {mutation.isPending ? 'Menyimpan…' : 'Setor Jaminan'}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectGuaranteeModal;
