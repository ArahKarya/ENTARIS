/**
 * Tambah / Edit Akun dialog. Payloads are unchanged from the legacy page:
 *   POST /coa  { accountNumber, name, accountType, rootType, isGroup, description, parentId }
 *   PUT  /coa/:id { accountNumber, name, isGroup, isActive }
 * The server derives rootType from the number prefix and enforces uniqueness
 * and group/child rules; its error message is shown inline.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import { ROOT_TYPES, apiErrorMessage, rootTypeFromNumber, rootTypeLabel, walkTree, type CoaNode } from './coa-tree';
import { SystemAccountBadge } from './coa-tree-table';

const NO_PARENT = '__root__';

export type AccountDialogState = { mode: 'create'; parent: CoaNode | null } | { mode: 'edit'; node: CoaNode } | null;

export interface AccountFormDialogProps {
  state: AccountDialogState;
  onClose: () => void;
  tree: readonly CoaNode[];
  systemRoles: ReadonlyMap<string, string[]>;
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded accent-primary"
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function AccountFormDialog({ state, onClose, tree, systemRoles }: AccountFormDialogProps) {
  const queryClient = useQueryClient();
  const open = state !== null;
  const isEdit = state?.mode === 'edit';
  const editNode = state?.mode === 'edit' ? state.node : null;

  const groups = useMemo(() => walkTree(tree).filter((n) => n.isGroup), [tree]);

  const [parentId, setParentId] = useState<string>(NO_PARENT);
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [rootType, setRootType] = useState<string>('ASSET');
  const [accountType, setAccountType] = useState<string>('ASSET');
  const [isGroup, setIsGroup] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    accountNumber?: string;
    name?: string;
  }>({});

  // Hydrate whenever the dialog opens for a (new) target.
  const stateKey = state ? (state.mode === 'edit' ? `e:${state.node.id}` : `c:${state.parent?.id ?? ''}`) : '';
  useEffect(() => {
    if (!state) return;
    setError('');
    setFieldErrors({});
    if (state.mode === 'edit') {
      setAccountNumber(state.node.accountNumber);
      setName(state.node.name);
      setRootType(state.node.rootType);
      setIsGroup(state.node.isGroup);
      setIsActive(state.node.isActive);
    } else {
      const p = state.parent;
      setParentId(p?.id ?? NO_PARENT);
      setAccountNumber(p ? `${p.accountNumber}.` : '');
      setName('');
      setRootType(p?.rootType ?? 'ASSET');
      setAccountType(p?.account.accountType ?? 'ASSET');
      setIsGroup(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  const parent = parentId === NO_PARENT ? null : (groups.find((g) => g.id === parentId) ?? null);

  const changeParent = (id: string) => {
    const prevPrefix = parent ? `${parent.accountNumber}.` : '';
    const next = id === NO_PARENT ? null : (groups.find((g) => g.id === id) ?? null);
    setParentId(id);
    // Re-prefix the number only while the user has not typed past the old prefix.
    if (accountNumber === '' || accountNumber === prevPrefix) setAccountNumber(next ? `${next.accountNumber}.` : '');
    if (next) {
      setRootType(next.rootType);
      setAccountType(next.account.accountType);
    }
  };

  const changeNumber = (value: string) => {
    setAccountNumber(value);
    if (!parent) {
      const derived = rootTypeFromNumber(value);
      if (derived) {
        setRootType(derived);
        setAccountType(derived);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? api.put(`/coa/${editNode!.id}`, payload) : api.post('/coa', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success(isEdit ? 'Akun berhasil diperbarui.' : 'Akun berhasil ditambahkan.');
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e, isEdit ? 'Gagal mengupdate akun.' : 'Gagal membuat akun.')),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const next = {
      accountNumber: accountNumber.trim() ? undefined : 'Nomor akun wajib diisi.',
      name: name.trim() ? undefined : 'Nama akun wajib diisi.',
    };
    setFieldErrors(next);
    if (next.accountNumber || next.name) return;
    if (isEdit) {
      mutation.mutate({ accountNumber, name, isGroup, isActive });
    } else {
      mutation.mutate({
        accountNumber,
        name,
        accountType,
        rootType,
        isGroup,
        description: '',
        parentId: parent?.id || null,
      });
    }
  };

  const editRoles = editNode ? systemRoles.get(editNode.id) : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Akun' : parent ? 'Tambah Sub-akun' : 'Tambah Akun'}</DialogTitle>
            <DialogDescription>
              {isEdit && editNode ? (
                <>
                  <span className="font-mono">{editNode.accountNumber}</span> · {rootTypeLabel(editNode.rootType)} ·{' '}
                  {editNode.isGroup ? 'Grup' : 'Detail'}
                </>
              ) : (
                'Akun grup hanya mengelompokkan sub-akun; transaksi dicatat ke akun detail.'
              )}
            </DialogDescription>
          </DialogHeader>

          {editRoles && editRoles.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <SystemAccountBadge roles={editRoles} />
              <p>
                Dipakai untuk posting otomatis ({editRoles.join(', ')}). Akun ini tidak dapat dihapus selama masih
                dipetakan di Pengaturan → Akun Sistem.
              </p>
            </div>
          )}

          <div className="grid gap-3">
            {!isEdit && (
              <Field label="Akun induk" hint="Kosongkan untuk membuat akun level teratas.">
                {(ctl) => (
                  <Select value={parentId} onValueChange={changeParent}>
                    <SelectTrigger {...ctl}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>Tanpa induk (level teratas)</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          <span className="font-mono text-xs">{g.accountNumber}</span> {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nomor akun" required error={fieldErrors.accountNumber}>
                <Input
                  value={accountNumber}
                  onChange={(e) => changeNumber(e.target.value)}
                  placeholder="1.1.6"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Field
                label="Tipe root"
                hint={
                  isEdit
                    ? 'Mengikuti digit pertama nomor akun.'
                    : parent
                      ? 'Mengikuti akun induk.'
                      : 'Otomatis dari digit pertama.'
                }
              >
                {(ctl) =>
                  isEdit || parent ? (
                    <Input
                      {...ctl}
                      value={rootTypeLabel(isEdit ? (rootTypeFromNumber(accountNumber) ?? rootType) : rootType)}
                      disabled
                      readOnly
                    />
                  ) : (
                    <Select
                      value={rootType}
                      onValueChange={(v) => {
                        setRootType(v);
                        setAccountType(v);
                      }}
                    >
                      <SelectTrigger {...ctl}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {rootTypeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                }
              </Field>
            </div>

            <Field label="Nama akun" required error={fieldErrors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis: Bank BNI" />
            </Field>

            <Checkbox
              checked={isGroup}
              onChange={setIsGroup}
              label="Akun grup"
              hint="Hanya untuk mengelompokkan sub-akun. Akun grup yang masih punya sub-akun tidak bisa diubah menjadi detail."
            />
            {isEdit && (
              <Checkbox
                checked={isActive}
                onChange={setIsActive}
                label="Akun aktif"
                hint="Akun nonaktif tidak muncul di pilihan akun pada transaksi."
              />
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Batal
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isEdit ? 'Simpan perubahan' : 'Simpan akun'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
