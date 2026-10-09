/**
 * Opening balance for a detail account. The server posts an opening-balance journal
 * against Ekuitas Saldo Awal; the preview shows the exact amount submitted.
 */
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { apiErrorMessage, isZero, normalSide, parseBalanceInput, type CoaNode } from './coa-tree';

export interface OpeningBalanceDialogProps {
  node: CoaNode | null;
  onClose: () => void;
}

function sideLabel(node: CoaNode, amount: number): string {
  if (isZero(amount)) return '';
  const normal = normalSide(node.rootType);
  const side = amount > 0 ? normal : normal === 'D' ? 'K' : 'D';
  return side === 'D' ? 'Debit' : 'Kredit';
}

export function OpeningBalanceDialog({ node, onClose }: OpeningBalanceDialogProps) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={node !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent size="sm">
        {/* Keyed so the form re-initialises for every account. */}
        {node && <BalanceForm key={node.id} node={node} onClose={onClose} onPendingChange={setPending} />}
      </DialogContent>
    </Dialog>
  );
}

function BalanceForm({
  node,
  onClose,
  onPendingChange,
}: {
  node: CoaNode;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState(() => String(node.balance || 0));
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: { balance: number }) => api.patch(`/coa/${node.id}/balance`, data),
    onMutate: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success('Saldo awal berhasil diatur.');
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e, 'Gagal mengatur saldo awal.')),
  });

  const parsed = parseBalanceInput(balance);
  const valid = !Number.isNaN(parsed);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!valid) {
      setError('Masukkan angka yang valid.');
      return;
    }
    mutation.mutate({ balance: parsed });
  };

  const current = node.balance;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Atur Saldo Awal</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{node.accountNumber}</span> · {node.name}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Saldo saat ini</dt>
          <dd className="num mt-0.5 font-medium text-foreground">
            {formatRupiah(Math.abs(current))}{' '}
            {sideLabel(node, current) && (
              <span className="text-xs text-muted-foreground">({sideLabel(node, current)})</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Saldo normal</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {normalSide(node.rootType) === 'D' ? 'Debit' : 'Kredit'}
          </dd>
        </div>
      </dl>

      <Field
        label="Saldo baru"
        required
        hint={
          <>
            Format Indonesia: titik untuk ribuan, koma untuk desimal (mis. 1.500.000,50). Nilai negatif = saldo
            berlawanan.
            <br />
            Jurnal saldo awal otomatis dibuat terhadap akun Ekuitas Saldo Awal.
          </>
        }
      >
        <Input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          className="num font-mono"
        />
      </Field>
      <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
        Akan disimpan:{' '}
        <span className="num font-medium text-foreground">
          {valid
            ? formatRupiah(parsed, {
                decimals: Number.isInteger(parsed) ? 0 : 2,
                negative: 'parens',
              })
            : '—'}
        </span>
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text"
        >
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
          Batal
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Simpan saldo
        </Button>
      </DialogFooter>
    </form>
  );
}
