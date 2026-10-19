/**
 * Stock and production (/inventory); tabs live in ?tab= (and ?view= for production).
 * Switching tab/view drops list params because all lists share param names. Modals stay here
 * because header actions and cross-tab flows open them.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can, cap, getStoredUser } from '@/lib/permissions';
import { LIST_PARAM } from '@/hooks/useListState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, PageHeader } from '@/components/shared';
import { InventoryItemModal } from '@/components/InventoryItemModal';
import { StockMovementModal } from '@/components/StockMovementModal';
import { ProductionRunModal } from '@/components/ProductionRunModal';
import InventoryDashboardTab from '@/components/InventoryDashboardTab';
import ProductionDetailDrawer from '@/components/ProductionDetailDrawer';
import ProductionDashboardTab from '@/components/ProductionDashboardTab';
import ProductionCostStandardsTab from '@/components/ProductionCostStandardsTab';
import ProductionProcessesTab from '@/components/ProductionProcessesTab';
import MachinesTab from '@/components/MachinesTab';
import ApprovalPanel, { type ApprovalRequest } from '@/components/ApprovalPanel';
import ImportModal from '@/components/ImportModal';
import { InventoryItemsTab } from '@/components/inventory/InventoryItemsTab';
import { StockMovementsTab } from '@/components/inventory/StockMovementsTab';
import { ProductionRunsTab } from '@/components/inventory/ProductionRunsTab';
import { PRODUCTION_DRAFTS_ENDPOINT, ProductionDraftsTab } from '@/components/inventory/ProductionDraftsTab';
import { ServiceItemsTab } from '@/components/inventory/ServiceItemsTab';
import { ServiceItemModal } from '@/components/inventory/ServiceItemModal';
import {
  ITEM_FILTER_KEYS,
  MOVEMENT_FILTER_KEYS,
  PRODUCTION_FILTER_KEYS,
  SERVICE_FILTER_KEYS,
  errorMessage,
  type InventoryItemRow,
  type ProductionDraftList,
  type ProductionDraftRow,
  type ProductionRunRow,
  type ServiceItemRow,
  type StockMovementRow,
} from '@/components/inventory/inventory-rows';
import { PERIOD_PARAM } from '@/components/inventory/dashboard-model';
import { ProductionApprovalView } from '@/components/inventory/ProductionApprovalView';

type Tab = 'dashboard' | 'items' | 'movements' | 'production' | 'services';
type ProdView = 'dashboard' | 'data' | 'draft' | 'approval' | 'costStandards' | 'processes' | 'machines';

const TAB_PARAM = 'tab';
const VIEW_PARAM = 'view';
const TABS: readonly Tab[] = ['dashboard', 'items', 'movements', 'production', 'services'];
/** Label key: inventory:inventoryPage.prodViews.<value>. */
const PROD_VIEWS: readonly ProdView[] = ['dashboard', 'data', 'draft', 'approval', 'costStandards', 'processes', 'machines'];
/** Production master-data views carry their own "create" action. */
const MASTER_VIEWS = new Set<ProdView>(['costStandards', 'processes', 'machines']);
/** List params owned by the active list (cleared on tab / view switch). */
const LIST_KEYS = [
  ...new Set<string>([
    LIST_PARAM.page,
    LIST_PARAM.search,
    LIST_PARAM.sort,
    ...ITEM_FILTER_KEYS,
    ...MOVEMENT_FILTER_KEYS,
    ...PRODUCTION_FILTER_KEYS,
    ...SERVICE_FILTER_KEYS,
    // Dashboard state (period selector, stock-value grouping).
    PERIOD_PARAM,
    'valueBy',
  ]),
];

export function InventoryPage() {
  const { t } = useTranslation('inventory');
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewProduction = can('production');
  const rawTab = searchParams.get(TAB_PARAM) as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) && (rawTab !== 'production' || canViewProduction) ? rawTab : 'dashboard';
  const rawView = searchParams.get(VIEW_PARAM) as ProdView | null;
  const prodView: ProdView = PROD_VIEWS.some((v) => v === rawView) ? (rawView as ProdView) : 'dashboard';

  const canEditInventory = can('inventory', 'edit');
  const canEditProduction = can('production', 'edit');
  const canEditServices = can('sales_invoice', 'edit');
  const canCancelDocs = cap('doc.cancel');
  const queryClient = useQueryClient();

  // --- Modal / drawer state ---
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItemRow | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<InventoryItemRow | null>(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editMovement, setEditMovement] = useState<StockMovementRow | null>(null);
  const [cancelMovementTarget, setCancelMovementTarget] = useState<StockMovementRow | null>(null);
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [editProdRun, setEditProdRun] = useState<ProductionRunRow | null>(null);
  const [prodPrefillPayload, setProdPrefillPayload] = useState<unknown>(null);
  const [prodResubmitId, setProdResubmitId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ id: string; draftNumber: string; lastError?: string | null } | null>(null);
  const [postDraftTarget, setPostDraftTarget] = useState<ProductionDraftRow | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<ProductionDraftRow | null>(null);
  const [cancelProdTarget, setCancelProdTarget] = useState<string | null>(null);
  const [selectedProdRunId, setSelectedProdRunId] = useState<string | null>(null);
  const [serviceModal, setServiceModal] = useState<{ edit: ServiceItemRow | null } | null>(null);

  // Badge on the "Draft" view: drafts not yet posted (Draft + menunggu persetujuan).
  const { data: draftCounts } = useQuery({
    queryKey: ['production-runs', 'drafts', 'counts'],
    queryFn: async () =>
      (await api.get<ProductionDraftList>(PRODUCTION_DRAFTS_ENDPOINT, { params: { limit: 1 } })).data.counts ?? {},
    enabled: tab === 'production' && canViewProduction,
  });
  const openDrafts = (draftCounts?.Draft ?? 0) + (draftCounts?.PendingApproval ?? 0);

  // Item list for the production dashboard filter and the production modal
  // (same legacy call the page always made: stock-descending, first 100).
  const { data: productionItems } = useQuery({
    queryKey: ['inventory-items', 'production-options'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      return (res.data.data ?? res.data) as InventoryItemRow[];
    },
    enabled: tab === 'production' || productionModalOpen,
  });

  const navigate = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        for (const key of LIST_KEYS) params.delete(key);
        for (const [k, v] of Object.entries(patch)) {
          if (v) params.set(k, v);
          else params.delete(k);
        }
        return params;
      });
    },
    [setSearchParams],
  );

  const changeTab = (next: string) => navigate({ [TAB_PARAM]: next === 'dashboard' ? null : next, [VIEW_PARAM]: null });
  const changeView = (next: string) => navigate({ [VIEW_PARAM]: next === 'dashboard' ? null : next });

  // --- Handlers (stable: passed into memoised table columns) ---
  const openItemEdit = useCallback((item: InventoryItemRow) => {
    setEditItem(item);
    setItemModalOpen(true);
  }, []);
  const showItemMovements = useCallback(
    (item: InventoryItemRow) => navigate({ [TAB_PARAM]: 'movements', [VIEW_PARAM]: null, itemId: item.id }),
    [navigate],
  );
  const openMovementEdit = useCallback((m: StockMovementRow) => {
    setEditMovement(m);
    setMovementModalOpen(true);
  }, []);
  const openRunEdit = useCallback(async (run: ProductionRunRow) => {
    // Edit diajukan lewat approval utk non-Admin: jangan buka form bila sudah ada pengajuan Pending.
    try {
      const { data } = await api.get('/approvals/pending', { params: { documentType: 'ProductionRunEdit', documentId: run.id } });
      if (data?.pending) {
        toast.error(t('inventoryPage.toast.editPending'));
        return;
      }
    } catch { /* server tetap menolak duplikat (409) */ }
    setEditProdRun(run);
    setProductionModalOpen(true);
  }, [t]);
  const askCancelRun = useCallback((run: ProductionRunRow) => setCancelProdTarget(run.id), []);
  const openServiceEdit = useCallback((svc: ServiceItemRow) => setServiceModal({ edit: svc }), []);

  const openItemCreate = () => {
    setEditItem(null);
    setItemModalOpen(true);
  };
  const openMovementCreate = () => {
    setEditMovement(null);
    setMovementModalOpen(true);
  };
  const openRunCreate = () => {
    setEditProdRun(null);
    setEditDraft(null);
    setProdPrefillPayload(null);
    setProductionModalOpen(true);
  };
  const openDraftEdit = useCallback(async (d: ProductionDraftRow) => {
    try {
      const { data } = await api.get(`${PRODUCTION_DRAFTS_ENDPOINT}/${d.id}`);
      setEditProdRun(null);
      setProdResubmitId(null);
      setProdPrefillPayload(data.payload);
      setEditDraft({ id: data.id, draftNumber: data.draftNumber, lastError: data.lastError });
      setProductionModalOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.openDraftFailed')));
    }
  }, [t]);
  const askPostDraft = useCallback((d: ProductionDraftRow) => setPostDraftTarget(d), []);
  const askDeleteDraft = useCallback((d: ProductionDraftRow) => setDeleteDraftTarget(d), []);
  const canManageDraft = useCallback(
    (d: ProductionDraftRow) => cap('approval.bypass') || d.createdBy?.id === getStoredUser()?.id,
    [],
  );
  const invalidateAfterPost = () => {
    for (const key of ['production-runs', 'stock-movements', 'inventory-items', 'approval-requests', 'approval-pending']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  const handlePostDraft = async () => {
    if (!postDraftTarget) return;
    try {
      const { data } = await api.post(`${PRODUCTION_DRAFTS_ENDPOINT}/${postDraftTarget.id}/post`);
      toast.success(
        data?.pendingApproval
          ? t('inventoryPage.toast.draftSentForApproval', { number: postDraftTarget.draftNumber })
          : t('inventoryPage.toast.draftPosted', {
              number: postDraftTarget.draftNumber,
              run: data?.runNumber ?? t('inventoryPage.productionRunFallback'),
            }),
      );
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.postDraftFailed')));
    } finally {
      invalidateAfterPost();
      setPostDraftTarget(null);
    }
  };
  const handleDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    try {
      await api.delete(`${PRODUCTION_DRAFTS_ENDPOINT}/${deleteDraftTarget.id}`);
      toast.success(t('inventoryPage.toast.draftDeleted', { number: deleteDraftTarget.draftNumber }));
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.deleteDraftFailed')));
    } finally {
      queryClient.invalidateQueries({ queryKey: ['production-runs', 'drafts'] });
      setDeleteDraftTarget(null);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    try {
      await api.delete(`/inventory/items/${deleteItemTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(t('inventoryPage.toast.itemDeleted'));
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.deleteItemFailed')));
    } finally {
      setDeleteItemTarget(null);
    }
  };

  const handleCancelMovement = async () => {
    if (!cancelMovementTarget) return;
    try {
      await api.put(`/inventory/movements/${cancelMovementTarget.id}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(t('inventoryPage.toast.movementCancelled'));
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.cancelMovementFailed')));
    } finally {
      setCancelMovementTarget(null);
    }
  };

  const handleCancelProduction = async () => {
    if (!cancelProdTarget) return;
    try {
      await api.put(`/inventory/production-runs/${cancelProdTarget}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(t('inventoryPage.toast.runCancelled'));
    } catch (err) {
      toast.error(errorMessage(err, t('inventoryPage.toast.cancelRunFailed')));
    } finally {
      setCancelProdTarget(null);
    }
  };

  const handleDeactivateService = useCallback(
    async (svc: ServiceItemRow) => {
      try {
        await api.delete(`/service-items/${svc.id}`);
        queryClient.invalidateQueries({ queryKey: ['service-items'] });
        toast.success(t('inventoryPage.toast.serviceDeactivated'));
      } catch (err) {
        toast.error(errorMessage(err, t('inventoryPage.toast.deactivateServiceFailed')));
      }
    },
    [queryClient, t],
  );

  let actions: ReactNode = null;
  if (tab === 'items' && canEditInventory) {
    actions = (
      <>
        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
          <Upload aria-hidden />
          <span className="sr-only sm:not-sr-only">{t('inventoryPage.actions.import')}</span>
        </Button>
        <Button onClick={openItemCreate}>
          <Plus aria-hidden />
          {t('inventoryPage.actions.addItem')}
        </Button>
      </>
    );
  } else if (tab === 'movements' && canEditInventory) {
    actions = (
      <Button onClick={openMovementCreate}>
        <Plus aria-hidden />
        {t('inventoryPage.actions.recordMovement')}
      </Button>
    );
  } else if (tab === 'production' && canEditProduction && !MASTER_VIEWS.has(prodView)) {
    actions = (
      <Button onClick={openRunCreate}>
        <Plus aria-hidden />
        {t('inventoryPage.actions.productionDraft')}
      </Button>
    );
  } else if (tab === 'services' && canEditServices) {
    actions = (
      <Button onClick={() => setServiceModal({ edit: null })}>
        <Plus aria-hidden />
        {t('inventoryPage.actions.addService')}
      </Button>
    );
  }

  return (
    // Manual activation: with automatic activation Radix fires onValueChange on
    // mousedown AND focus before the URL-driven value updates → two history entries.
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader title={t('inventoryPage.title')} description={t(`inventoryPage.description.${tab}`)} actions={actions}>
        <TabsList variant="underline" aria-label={t('inventoryPage.tabsLabel')}>
          <TabsTrigger value="dashboard">{t('inventoryPage.tabs.dashboard')}</TabsTrigger>
          <TabsTrigger value="items">{t('inventoryPage.tabs.items')}</TabsTrigger>
          <TabsTrigger value="movements">{t('inventoryPage.tabs.movements')}</TabsTrigger>
          {canViewProduction && <TabsTrigger value="production">{t('inventoryPage.tabs.production')}</TabsTrigger>}
          <TabsTrigger value="services">{t('inventoryPage.tabs.services')}</TabsTrigger>
        </TabsList>
      </PageHeader>

      <TabsContent value="dashboard" className="mt-0">
        <InventoryDashboardTab />
      </TabsContent>

      <TabsContent value="items" className="mt-0">
        <InventoryItemsTab
          canEdit={canEditInventory}
          onCreate={openItemCreate}
          onEdit={openItemEdit}
          onDelete={setDeleteItemTarget}
          onShowMovements={showItemMovements}
        />
      </TabsContent>

      <TabsContent value="movements" className="mt-0">
        <StockMovementsTab
          canEdit={canEditInventory}
          canCancel={canCancelDocs}
          onCreate={canEditInventory ? openMovementCreate : undefined}
          onEdit={openMovementEdit}
          onCancel={setCancelMovementTarget}
          onOpenProductionRun={canViewProduction ? setSelectedProdRunId : undefined}
        />
      </TabsContent>

      {canViewProduction && (
        <TabsContent value="production" className="mt-0">
          <Tabs value={prodView} onValueChange={changeView} activationMode="manual" className="space-y-4">
            <div className="max-w-full overflow-x-auto">
              <TabsList aria-label={t('inventoryPage.prodViewsLabel')}>
                {PROD_VIEWS.map((v) => (
                  <TabsTrigger key={v} value={v}>
                    {t(`inventoryPage.prodViews.${v}`)}
                    {v === 'draft' && openDrafts > 0 && (
                      <span className="num ml-1.5 rounded-sm bg-primary-subtle px-1.5 text-xs font-medium text-primary-subtle-foreground">
                        <span aria-hidden>{openDrafts}</span>
                        <span className="sr-only">{t('inventoryPage.openDraftsSr', { count: openDrafts })}</span>
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="dashboard" className="mt-0">
              <ProductionDashboardTab onOpenRun={setSelectedProdRunId} />
            </TabsContent>
            <TabsContent value="data" className="mt-0">
              <ProductionRunsTab
                canEdit={canEditProduction}
                canCancel={canCancelDocs}
                onCreate={canEditProduction ? openRunCreate : undefined}
                onOpen={setSelectedProdRunId}
                onEdit={openRunEdit}
                onCancel={askCancelRun}
              />
            </TabsContent>
            <TabsContent value="draft" className="mt-0">
              <ProductionDraftsTab
                canEdit={canEditProduction}
                canManage={canManageDraft}
                onCreate={canEditProduction ? openRunCreate : undefined}
                onEdit={openDraftEdit}
                onPost={askPostDraft}
                onDelete={askDeleteDraft}
                onOpenRun={setSelectedProdRunId}
              />
            </TabsContent>
            <TabsContent value="approval" className="mt-0">
              <ProductionApprovalView>
                <ApprovalPanel
                  documentType={['ProductionRun', 'ProductionRunEdit']}
                  onResubmit={(req: ApprovalRequest) => {
                    setEditProdRun(null);
                    setProdPrefillPayload(req.payload);
                    setProdResubmitId(req.id);
                    setProductionModalOpen(true);
                  }}
                  onViewDocument={(req: ApprovalRequest) => {
                    if (req.documentId) setSelectedProdRunId(req.documentId);
                  }}
                />
              </ProductionApprovalView>
            </TabsContent>
            <TabsContent value="costStandards" className="mt-0">
              <ProductionCostStandardsTab />
            </TabsContent>
            <TabsContent value="processes" className="mt-0">
              <ProductionProcessesTab />
            </TabsContent>
            <TabsContent value="machines" className="mt-0">
              <MachinesTab />
            </TabsContent>
          </Tabs>
        </TabsContent>
      )}

      <TabsContent value="services" className="mt-0">
        <ServiceItemsTab
          canEdit={canEditServices}
          canDeactivate={canCancelDocs}
          onCreate={canEditServices ? () => setServiceModal({ edit: null }) : undefined}
          onEdit={openServiceEdit}
          onDeactivate={handleDeactivateService}
        />
      </TabsContent>

      {/* Modals */}
      {serviceModal && <ServiceItemModal editService={serviceModal.edit} onClose={() => setServiceModal(null)} />}

      <InventoryItemModal isOpen={itemModalOpen} onClose={() => setItemModalOpen(false)} editItem={editItem} />

      <StockMovementModal
        isOpen={movementModalOpen}
        onClose={() => {
          setMovementModalOpen(false);
          setEditMovement(null);
        }}
        editMovement={editMovement}
      />

      <ProductionRunModal
        isOpen={productionModalOpen}
        onClose={() => {
          setProductionModalOpen(false);
          setEditProdRun(null);
          setProdPrefillPayload(null);
          setProdResubmitId(null);
          setEditDraft(null);
        }}
        items={productionItems ?? []}
        editRun={editProdRun}
        prefillPayload={prodPrefillPayload}
        resubmitRequestId={prodResubmitId}
        draft={editDraft}
      />

      <ProductionDetailDrawer
        runId={selectedProdRunId}
        onClose={() => setSelectedProdRunId(null)}
        canCancel={canCancelDocs}
        canEdit={canEditProduction}
        onEdit={(run) => {
          setSelectedProdRunId(null);
          openRunEdit(run);
        }}
        onCancel={(id) => {
          setSelectedProdRunId(null);
          setCancelProdTarget(id);
        }}
      />

      <ConfirmDialog
        open={deleteItemTarget !== null}
        onOpenChange={(open) => !open && setDeleteItemTarget(null)}
        tone="danger"
        title={t('inventoryPage.deleteItem.title')}
        description={t('inventoryPage.deleteItem.description', { name: deleteItemTarget?.name ?? t('inventoryPage.deleteItem.fallbackName') })}
        confirmLabel={t('inventoryPage.confirm.yesDelete')}
        onConfirm={handleDeleteItem}
      />

      <ConfirmDialog
        open={cancelMovementTarget !== null}
        onOpenChange={(open) => !open && setCancelMovementTarget(null)}
        tone="danger"
        title={t('inventoryPage.cancelMovement.title')}
        description={t('inventoryPage.cancelMovement.description', {
          number: cancelMovementTarget?.movementNumber ?? t('inventoryPage.cancelMovement.fallbackName'),
        })}
        confirmLabel={t('inventoryPage.confirm.yesCancel')}
        cancelLabel={t('inventoryPage.confirm.no')}
        onConfirm={handleCancelMovement}
      />

      <ConfirmDialog
        open={cancelProdTarget !== null}
        onOpenChange={(open) => !open && setCancelProdTarget(null)}
        tone="danger"
        title={t('inventoryPage.cancelRun.title')}
        description={t('inventoryPage.cancelRun.description')}
        confirmLabel={t('inventoryPage.confirm.yesCancel')}
        cancelLabel={t('inventoryPage.confirm.no')}
        onConfirm={handleCancelProduction}
      />

      <ConfirmDialog
        open={postDraftTarget !== null}
        onOpenChange={(open) => !open && setPostDraftTarget(null)}
        title={t('inventoryPage.postDraft.title', { number: postDraftTarget?.draftNumber ?? t('inventoryPage.draftFallback') })}
        description={
          cap('approval.bypass') ? t('inventoryPage.postDraft.descriptionDirect') : t('inventoryPage.postDraft.descriptionApproval')
        }
        confirmLabel={cap('approval.bypass') ? t('inventoryPage.postDraft.confirmDirect') : t('inventoryPage.postDraft.confirmApproval')}
        cancelLabel={t('inventoryPage.confirm.cancel')}
        onConfirm={handlePostDraft}
      />

      <ConfirmDialog
        open={deleteDraftTarget !== null}
        onOpenChange={(open) => !open && setDeleteDraftTarget(null)}
        tone="danger"
        title={t('inventoryPage.deleteDraft.title', { number: deleteDraftTarget?.draftNumber ?? t('inventoryPage.draftFallback') })}
        description={t('inventoryPage.deleteDraft.description')}
        confirmLabel={t('inventoryPage.confirm.yesDelete')}
        cancelLabel={t('inventoryPage.confirm.cancel')}
        onConfirm={handleDeleteDraft}
      />

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} importType="inventory" />
    </Tabs>
  );
}
