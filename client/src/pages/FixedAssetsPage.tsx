/**
 * Fixed assets (/fixed-assets): register (no ?tab) and monthly depreciation posting
 * (?tab=depreciation&month=YYYY-MM, always confirmed); ?asset=<id> opens the detail sheet.
 * Write actions need `fixed_assets` edit permission (the server enforces the same rule).
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { LIST_PARAM, useListState } from '@/hooks/useListState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, PageHeader, fetchAllPages } from '@/components/shared';
import { FixedAssetRegister } from '@/components/fixed-assets/FixedAssetRegister';
import { FixedAssetDetailSheet } from '@/components/fixed-assets/FixedAssetDetailSheet';
import { FixedAssetFormDialog } from '@/components/fixed-assets/FixedAssetFormDialog';
import { FixedAssetEditDialog } from '@/components/fixed-assets/FixedAssetEditDialog';
import { FixedAssetImportDialog } from '@/components/fixed-assets/FixedAssetImportDialog';
import { DepreciationRunPanel } from '@/components/fixed-assets/DepreciationRunPanel';
import { JournalPreview } from '@/components/fixed-assets/JournalPreview';
import { apiError } from '@/components/fixed-assets/errors';
import { MONTH_PATTERN, downloadCsv, previousMonth, toFixedAssetCsv } from '@/components/fixed-assets/fixed-asset-utils';
import {
  FIXED_ASSET_ENDPOINT,
  FIXED_ASSET_FILTER_KEYS,
  type CoaOption,
  type DepreciationPostTarget,
  type FixedAssetRow,
} from '@/components/fixed-assets/types';

type Tab = 'list' | 'depreciation';

const TAB_PARAM = 'tab';
const MONTH_PARAM = 'month';
const ASSET_PARAM = 'asset';
/** Params owned by the register tab (cleared on tab switch). */
const LIST_KEYS = [LIST_PARAM.page, LIST_PARAM.search, LIST_PARAM.sort, ...FIXED_ASSET_FILTER_KEYS];

export default function FixedAssetsPage() {
  const { t } = useTranslation('finance');
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = can('fixed_assets', 'edit');
  const tab: Tab = canEdit && searchParams.get(TAB_PARAM) === 'depreciation' ? 'depreciation' : 'list';
  const monthParam = searchParams.get(MONTH_PARAM);
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : previousMonth();
  const assetId = searchParams.get(ASSET_PARAM);

  const list = useListState({ filters: FIXED_ASSET_FILTER_KEYS });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FixedAssetRow | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<FixedAssetRow | null>(null);
  const [postTarget, setPostTarget] = useState<DepreciationPostTarget | null>(null);
  const [lastOpened, setLastOpened] = useState<FixedAssetRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const patchParams = useCallback(
    (patch: Record<string, string | null>, replace = false) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace },
      ),
    [setSearchParams],
  );

  const changeTab = (next: string) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of LIST_KEYS) params.delete(key);
      params.delete(MONTH_PARAM);
      if (next === 'depreciation') params.set(TAB_PARAM, 'depreciation');
      else params.delete(TAB_PARAM);
      return params;
    });

  const openAsset = useCallback(
    (asset: FixedAssetRow) => {
      setLastOpened(asset);
      patchParams({ [ASSET_PARAM]: asset.id });
    },
    [patchParams],
  );
  const closeAsset = () => patchParams({ [ASSET_PARAM]: null });

  const coaQuery = useQuery({
    queryKey: ['coa-flat'],
    queryFn: async () => {
      const res = await api.get<CoaOption[] | { data: CoaOption[] }>('/coa/flat');
      return Array.isArray(res.data) ? res.data : res.data.data;
    },
    enabled: canEdit && (createOpen || importOpen),
  });

  const depreciateMut = useMutation({
    mutationFn: async ({ assetId: id, entryId }: { assetId: string; entryId: string }) =>
      (await api.post(`${FIXED_ASSET_ENDPOINT}/${id}/depreciate`, { entryId })).data,
    onSuccess: () => {
      toast.success(t('fixedAssetsPage.toast.depreciationPosted'));
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
    },
    onError: (err) => toast.error(apiError(err, t('fixedAssetsPage.toast.depreciationFailed'))),
  });

  const disposeMut = useMutation({
    mutationFn: async ({ id, disposalDate }: { id: string; disposalDate: string }) =>
      (await api.post(`${FIXED_ASSET_ENDPOINT}/${id}/dispose`, { disposalDate, disposalAmount: 0 })).data,
    onSuccess: () => {
      toast.success(t('fixedAssetsPage.toast.disposed'));
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
    },
    onError: (err) => toast.error(apiError(err, t('fixedAssetsPage.toast.disposeFailed'))),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<FixedAssetRow>(FIXED_ASSET_ENDPOINT, params);
      if (rows.length === 0) {
        toast.error(t('fixedAssetsPage.toast.nothingToExport'));
        return;
      }
      downloadCsv(toFixedAssetCsv(rows), `fixed-assets-${new Date().toISOString().substring(0, 10)}.csv`);
      if (truncated) toast.warning(t('fixedAssetsPage.toast.exportTruncated', { count: rows.length }));
      else toast.success(t('fixedAssetsPage.toast.exported', { count: rows.length }));
    } catch {
      toast.error(t('fixedAssetsPage.toast.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const coa = useMemo(() => coaQuery.data ?? [], [coaQuery.data]);

  return (
    // Manual activation: avoids two history entries per click (see DeliveryOrders).
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title={t('fixedAssetsPage.title')}
        description={t('fixedAssetsPage.description')}
        actions={
          tab === 'list' && (
            <>
              <Button variant="outline" onClick={handleExport} loading={exporting}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('fixedAssetsPage.exportCsv')}</span>
              </Button>
              {canEdit && (
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload aria-hidden />
                  <span className="sr-only sm:not-sr-only">{t('fixedAssetsPage.importCsv')}</span>
                </Button>
              )}
              {canEdit && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  {t('fixedAssetsPage.add')}
                </Button>
              )}
            </>
          )
        }
      >
        {canEdit && (
          <TabsList variant="underline" aria-label={t('fixedAssetsPage.tabs.label')}>
            <TabsTrigger value="list">{t('fixedAssetsPage.tabs.list')}</TabsTrigger>
            <TabsTrigger value="depreciation">{t('fixedAssetsPage.tabs.depreciation')}</TabsTrigger>
          </TabsList>
        )}
      </PageHeader>

      <TabsContent value="list" className="mt-0">
        <FixedAssetRegister
          list={list}
          canEdit={canEdit}
          onOpen={openAsset}
          onEdit={setEditTarget}
          onDispose={setDisposeTarget}
          onCreate={() => setCreateOpen(true)}
        />
      </TabsContent>

      {canEdit && (
        <TabsContent value="depreciation" className="mt-0">
          <DepreciationRunPanel month={month} onMonthChange={(m) => patchParams({ [MONTH_PARAM]: m }, true)} />
        </TabsContent>
      )}

      <FixedAssetDetailSheet
        assetId={assetId}
        fallback={lastOpened}
        onClose={closeAsset}
        onEdit={canEdit ? setEditTarget : undefined}
        onDispose={canEdit ? setDisposeTarget : undefined}
        onPostEntry={canEdit ? setPostTarget : undefined}
        postingEntryId={depreciateMut.isPending ? (depreciateMut.variables?.entryId ?? null) : null}
      />

      {canEdit && (
        <>
          <FixedAssetFormDialog open={createOpen} onOpenChange={setCreateOpen} coa={coa} coaLoading={coaQuery.isLoading} />
          <FixedAssetImportDialog open={importOpen} onOpenChange={setImportOpen} coa={coa} />
          <FixedAssetEditDialog asset={editTarget} onClose={() => setEditTarget(null)} />
        </>
      )}

      <ConfirmDialog
        open={disposeTarget !== null}
        onOpenChange={(open) => !open && setDisposeTarget(null)}
        tone="danger"
        title={t('fixedAssetsPage.dispose.title')}
        description={t('fixedAssetsPage.dispose.description', { name: disposeTarget?.name ?? disposeTarget?.assetNumber ?? '' })}
        confirmLabel={t('fixedAssetsPage.dispose.confirm')}
        loading={disposeMut.isPending}
        onConfirm={async () => {
          if (!disposeTarget) return;
          await disposeMut.mutateAsync({ id: disposeTarget.id, disposalDate: new Date().toISOString().substring(0, 10) });
        }}
      />

      <ConfirmDialog
        open={postTarget !== null}
        onOpenChange={(open) => !open && setPostTarget(null)}
        title={t('fixedAssetsPage.post.title')}
        description={t('fixedAssetsPage.post.description')}
        confirmLabel={t('fixedAssetsPage.post.confirm')}
        loading={depreciateMut.isPending}
        onConfirm={async () => {
          if (!postTarget) return;
          await depreciateMut.mutateAsync({ assetId: postTarget.assetId, entryId: postTarget.entryId });
        }}
      >
        {postTarget && (
          <div className="space-y-3">
            <dl className="space-y-1.5 rounded-md border border-border px-3 py-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('fixedAssetsPage.post.asset')}</dt>
                <dd className="num font-mono text-foreground">{postTarget.assetNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('fixedAssetsPage.post.name')}</dt>
                <dd className="text-right font-medium text-foreground">{postTarget.assetName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('fixedAssetsPage.post.period')}</dt>
                <dd className="num text-foreground">{formatDate(postTarget.periodDate)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                <dt className="text-muted-foreground">{t('fixedAssetsPage.post.amount')}</dt>
                <dd className="num font-semibold text-foreground">{formatRupiah(postTarget.amount)}</dd>
              </div>
            </dl>
            <JournalPreview
              lines={[
                { side: 'DR', account: postTarget.depAccount, amount: formatRupiah(postTarget.amount) },
                { side: 'CR', account: postTarget.accumAccount, amount: formatRupiah(postTarget.amount) },
              ]}
              note={t('fixedAssetsPage.post.note')}
            />
          </div>
        )}
      </ConfirmDialog>
    </Tabs>
  );
}
