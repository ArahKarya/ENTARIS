/**
 * Bagan Akun (/coa) — Chart of Accounts as an accessible treegrid.
 *
 * GET /coa returns the whole hierarchy (~100 accounts), so search, root-type
 * and "bersaldo" filters run in memory and are URL-synced (q, root, saldo);
 * the expanded state lives in ?open= (see components/coa/use-coa-view.ts).
 * Group rows show subtotals computed from their descendants. Accounts mapped
 * in Pengaturan → Akun Sistem (GET /system-accounts) carry a lock badge and
 * cannot be deleted (the server rejects it too).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber } from '@/lib/format';
import { can, cap } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/shared';
import ImportModal from '@/components/ImportModal';
import {
  apiErrorMessage,
  buildCoaTree,
  countAccounts,
  countByRootType,
  exportRows,
  type CoaAccount,
  type CoaNode,
} from '@/components/coa/coa-tree';
import { CoaTreeTable } from '@/components/coa/coa-tree-table';
import { CoaToolbar } from '@/components/coa/coa-toolbar';
import { useCoaView } from '@/components/coa/use-coa-view';
import { AccountFormDialog, type AccountDialogState } from '@/components/coa/account-form-dialog';
import { OpeningBalanceDialog } from '@/components/coa/opening-balance-dialog';

interface SystemAccountsResponse {
  mappings: Record<string, Array<{ accountId: string }>>;
  roles: Array<{ key: string; label: string }>;
}

const EMPTY_TREE: CoaNode[] = [];

export const COAPage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('coa', 'edit');
  // DELETE /coa/:id additionally requires the doc.cancel capability.
  const canDelete = canEdit && cap('doc.cancel');

  const [dialog, setDialog] = useState<AccountDialogState>(null);
  const [balanceTarget, setBalanceTarget] = useState<CoaNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CoaNode | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const coaQuery = useQuery({
    queryKey: ['coa'],
    queryFn: async () => (await api.get('/coa')).data as CoaAccount[],
  });

  // Read-only mapping list; without it the page still works (no badges).
  const systemQuery = useQuery({
    queryKey: ['system-accounts'],
    queryFn: async () => (await api.get('/system-accounts')).data as SystemAccountsResponse,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const tree = useMemo(() => (coaQuery.data ? buildCoaTree(coaQuery.data) : EMPTY_TREE), [coaQuery.data]);
  const total = useMemo(() => countAccounts(tree), [tree]);
  const counts = useMemo(() => countByRootType(tree), [tree]);

  const systemRoles = useMemo(() => {
    const out = new Map<string, string[]>();
    const data = systemQuery.data;
    if (!data?.mappings) return out;
    const labels = new Map((data.roles ?? []).map((r) => [r.key, r.label]));
    for (const [role, list] of Object.entries(data.mappings)) {
      for (const m of list) out.set(m.accountId, [...(out.get(m.accountId) ?? []), labels.get(role) ?? role]);
    }
    return out;
  }, [systemQuery.data]);

  const view = useCoaView(tree);

  const handleExport = () => exportToExcel(exportRows(tree), 'bagan-akun');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/coa/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success(`Akun "${deleteTarget.name}" berhasil dihapus.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menghapus akun.'));
    }
  };

  let emptyState = null;
  if (coaQuery.error) {
    emptyState = (
      <EmptyState
        kind="error"
        description="Bagan akun gagal dimuat. Periksa koneksi Anda lalu coba lagi."
        action={
          <Button variant="outline" onClick={() => coaQuery.refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  } else if (total === 0) {
    emptyState = (
      <EmptyState
        title="Belum ada akun"
        description="Buat akun pertama atau impor bagan akun dari Excel."
        action={
          canEdit ? (
            <Button size="sm" onClick={() => setDialog({ mode: 'create', parent: null })}>
              <Plus aria-hidden />
              Tambah akun
            </Button>
          ) : undefined
        }
      />
    );
  } else if (view.filtering) {
    emptyState = (
      <EmptyState
        kind="no-results"
        description={view.query ? `Tidak ada akun yang cocok dengan "${view.query}".` : undefined}
        action={
          <Button variant="outline" size="sm" onClick={view.list.resetFilters}>
            Reset filter
          </Button>
        }
      />
    );
  }

  const ready = Boolean(coaQuery.data);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Bagan Akun"
        description="Struktur Chart of Accounts beserta saldo setiap akun."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
            {canEdit && (
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <Upload aria-hidden />
                <span className="sr-only sm:not-sr-only">Impor</span>
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => setDialog({ mode: 'create', parent: null })}>
                <Plus aria-hidden />
                Tambah Akun
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-3">
        <CoaToolbar view={view} counts={counts} total={total} disabled={!ready || total === 0} />

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {ready &&
            (view.filtering
              ? `Menampilkan ${formatNumber(view.filtered.visibleCount)} dari ${formatNumber(total)} akun`
              : `${formatNumber(total)} akun`)}
        </p>

        <CoaTreeTable
          rows={coaQuery.error ? [] : view.rows}
          query={view.query}
          matchIds={view.filtered.matchIds}
          systemRoles={systemRoles}
          canEdit={canEdit}
          canDelete={canDelete}
          loading={coaQuery.isLoading}
          emptyState={emptyState}
          onToggle={view.setNodeExpanded}
          onAddChild={(node) => setDialog({ mode: 'create', parent: node })}
          onEdit={(node) => setDialog({ mode: 'edit', node })}
          onSetBalance={setBalanceTarget}
          onDelete={setDeleteTarget}
        />
      </div>

      <AccountFormDialog state={dialog} onClose={() => setDialog(null)} tree={tree} systemRoles={systemRoles} />

      <OpeningBalanceDialog node={balanceTarget} onClose={() => setBalanceTarget(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title="Hapus akun?"
        description={
          deleteTarget ? (
            <>
              Akun <strong className="font-mono">{deleteTarget.accountNumber}</strong>{' '}
              <strong>{deleteTarget.name}</strong> akan dihapus permanen. Akun hanya bisa dihapus jika tidak memiliki
              sub-akun, tidak memiliki transaksi, dan saldonya nol.
            </>
          ) : null
        }
        confirmLabel="Ya, hapus"
        onConfirm={handleDelete}
      />

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} importType="coa" />
    </div>
  );
};

export default COAPage;
