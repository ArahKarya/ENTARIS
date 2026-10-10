import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { NONE_VALUE, dialogShellClass } from './sales/dialog-classes-b';

interface Guarantee {
  id: string;
  guaranteeNumber: string;
  projectName: string;
  party?: { id: string; name: string };
  amount: number;
  outstanding: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  guarantee: Guarantee | null;
}

// Settlement uang jaminan: dikembalikan (kas masuk) dan/atau hangus (beban),
// bisa parsial dan berulang sampai sisa habis.
const SettleGuaranteeModal: React.FC<Props> = ({ isOpen, onClose, guarantee }) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [returnAmount, setReturnAmount] = useState<number>(0);
  const [forfeitAmount, setForfeitAmount] = useState<number>(0);
  const [returnAccountId, setReturnAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return (res.data.data ?? res.data) as any[];
    },
    enabled: isOpen,
  });

  const cashAccounts = (accounts || []).filter(
    (a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'),
  );
  const expenseAccounts = (accounts || []).filter(
    (a: any) => !a.isGroup && a.rootType === 'EXPENSE',
  );

  // No reset useEffect: parent mounts `{settleTarget && <Modal key={id} ... />}`
  // so each target gets a fresh mount + useState() defaults.

  const outstanding = Number(guarantee?.outstanding ?? 0);
  const total = Number(returnAmount || 0) + Number(forfeitAmount || 0);
  const totalValid = total > 0 && total <= outstanding + 0.01;

  const mutation = useMutation({
    mutationFn: (body: any) => api.post(`/project-guarantees/${guarantee!.id}/settle`, body),
    onSuccess: () => {
      toast.success('Settlement uang jaminan disimpan.');
      queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Gagal memproses settlement.');
    },
  });

  const setReturnMax = () => setReturnAmount(Number((outstanding - Number(forfeitAmount || 0)).toFixed(2)));
  const setForfeitRest = () => {
    const rest = Math.max(0, Number((outstanding - Number(returnAmount || 0)).toFixed(2)));
    setForfeitAmount(rest);
  };

  const handleSubmit = () => {
    setError('');
    if (!totalValid) { setError('Total dikembalikan + hangus harus > 0 dan ≤ sisa jaminan.'); return; }
    if (Number(returnAmount) > 0 && !returnAccountId) { setError('Pilih akun kas/bank tujuan pengembalian.'); return; }
    mutation.mutate({
      date,
      returnAmount: Number(returnAmount) || 0,
      forfeitAmount: Number(forfeitAmount) || 0,
      returnAccountId: Number(returnAmount) > 0 ? returnAccountId : null,
      expenseAccountId: Number(forfeitAmount) > 0 && expenseAccountId ? expenseAccountId : null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={isOpen && !!guarantee} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (totalValid && !mutation.isPending) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle>Settlement Uang Jaminan</DialogTitle>
            <DialogDescription>
              {guarantee?.guaranteeNumber} · {guarantee?.projectName} ({guarantee?.party?.name})
            </DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Sisa Jaminan</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{formatRupiah(outstanding)}</p>
            </div>

            <Field label="Tanggal">
              <DateInput value={date} onChange={setDate} />
            </Field>

            <div className="grid gap-2">
              <Field label="Dikembalikan (kas masuk)">
                <NumberInput min={0} value={returnAmount || ''} onChange={(e) => setReturnAmount(Number(e.target.value) || 0)}
                  className="h-10 text-right tabular-nums md:h-9" placeholder="0" />
              </Field>
              <Button type="button" variant="link" size="sm" className="justify-self-end text-xs" onClick={setReturnMax}>
                Maks: {formatRupiah(Math.max(0, outstanding - Number(forfeitAmount || 0)))}
              </Button>
              {Number(returnAmount) > 0 && (
                <Field label="Akun kas/bank tujuan" required>
                  {(control) => (
                    <Select value={returnAccountId} onValueChange={setReturnAccountId}>
                      <SelectTrigger {...control}><SelectValue placeholder="Pilih akun kas/bank tujuan" /></SelectTrigger>
                      <SelectContent>
                        {cashAccounts.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.accountNumber} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            <div className="grid gap-2">
              <Field label="Hangus / Dipotong Penalti (jadi beban)">
                <NumberInput min={0} value={forfeitAmount || ''} onChange={(e) => setForfeitAmount(Number(e.target.value) || 0)}
                  className="h-10 text-right tabular-nums md:h-9" placeholder="0" />
              </Field>
              <Button type="button" variant="link" size="sm" className="justify-self-end text-xs" onClick={setForfeitRest}>
                Sisa: {formatRupiah(Math.max(0, outstanding - Number(returnAmount || 0)))}
              </Button>
              {Number(forfeitAmount) > 0 && (
                <Field label="Akun beban">
                  {(control) => (
                    <Select value={expenseAccountId || NONE_VALUE}
                      onValueChange={(v) => setExpenseAccountId(v === NONE_VALUE ? '' : v)}>
                      <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>Default: Beban Lain-lain</SelectItem>
                        {expenseAccounts.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.accountNumber} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            <Field label="Catatan (opsional)">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <dl className="grid gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs" aria-live="polite">
              <div className="flex justify-between"><dt className="text-muted-foreground">Total settlement:</dt><dd className="font-semibold tabular-nums">{formatRupiah(total)}</dd></div>
              <div className="flex justify-between text-muted-foreground"><dt>Sisa setelah ini:</dt><dd className="tabular-nums">{formatRupiah(Math.max(0, outstanding - total))}</dd></div>
            </dl>

            <FormError message={error} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</Button>
            <Button type="submit" disabled={!totalValid} loading={mutation.isPending}>
              {!mutation.isPending && <CheckCircle2 aria-hidden />}
              {mutation.isPending ? 'Memproses…' : 'Proses'}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SettleGuaranteeModal;
