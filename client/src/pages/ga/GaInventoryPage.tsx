/**
 * Inventaris Kantor (/ga/inventory) — General Affairs' own ATK / sparepart /
 * consumable stock per location, separate from the accounting inventory (no
 * GL). One page, tabs stored in the URL:
 *  • Dashboard stok       ?tab omitted
 *  • Item                 ?tab=items        (list kit, KPIs from /items/summary)
 *  • Pergerakan           ?tab=movements    (paged movement log)
 *  • Opname & Ekspor      ?tab=tools        (quick stock count, CSV export)
 * Tabs live in components/ga/inventory/ and follow pages/SalesInvoices.tsx.
 * Switching tab drops the list params because the lists share param names.
 * Write actions need `ga_inventory` edit permission (same gate as the server).
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Plus } from 'lucide-react';
import { can } from '@/lib/permissions';
import { LIST_PARAM } from '@/hooks/useListState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared';
import { GaInventoryDashboard } from '@/components/ga/inventory/GaInventoryDashboard';
import { GaItemsTab } from '@/components/ga/inventory/GaItemsTab';
import { GaMovementsTab } from '@/components/ga/inventory/GaMovementsTab';
import { GaInventoryTools } from '@/components/ga/inventory/GaInventoryTools';
import { GaItemFormSheet } from '@/components/ga/inventory/GaItemFormSheet';
import { GaMovementFormSheet } from '@/components/ga/inventory/GaMovementFormSheet';
import { GaOpnameFormSheet } from '@/components/ga/inventory/GaOpnameFormSheet';
import { ItemImageDialog } from '@/components/ga/inventory/ItemImage';
import { useGaLocations } from '@/components/ga/inventory/queries';
import { ITEM_FILTER_KEYS, MOVEMENT_FILTER_KEYS, type GaItemRow } from '@/components/ga/inventory/ga-inventory-model';

type Tab = 'dashboard' | 'items' | 'movements' | 'tools';

const TAB_PARAM = 'tab';
const TABS: readonly Tab[] = ['dashboard', 'items', 'movements', 'tools'];
/** List params owned by the active list (cleared on tab switch). */
const LIST_KEYS = [
  ...new Set<string>([LIST_PARAM.page, LIST_PARAM.search, LIST_PARAM.sort, ...ITEM_FILTER_KEYS, ...MOVEMENT_FILTER_KEYS]),
];

const DESCRIPTION: Record<Tab, string> = {
  dashboard: 'Ringkasan stok ATK, sparepart, dan perlengkapan kantor per lokasi.',
  items: 'Kelola item inventaris kantor dan pantau stoknya.',
  movements: 'Riwayat stok masuk, keluar, transfer antar lokasi, dan penyesuaian.',
  tools: 'Stok opname cepat dan ekspor data ke CSV.',
};

type ItemPreview = Pick<GaItemRow, 'id' | 'name' | 'imagePath'>;

export const GaInventoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get(TAB_PARAM) as Tab | null;
  const tab: Tab = rawTab && TABS.includes(rawTab) ? rawTab : 'dashboard';
  const canEdit = can('ga_inventory', 'edit');
  const canOpenMaster = can('ga_master');
  const locationsQuery = useGaLocations();
  const noLocations = locationsQuery.isSuccess && locationsQuery.data.length === 0;

  const [itemSheet, setItemSheet] = useState<{ item: GaItemRow | null } | null>(null);
  const [movementSheet, setMovementSheet] = useState<{ itemId?: string } | null>(null);
  const [opnameSheet, setOpnameSheet] = useState<{ itemId?: string } | null>(null);
  const [preview, setPreview] = useState<ItemPreview | null>(null);

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
  const changeTab = (next: string) => navigate({ [TAB_PARAM]: next === 'dashboard' ? null : next });

  // Stable handlers: passed into memoised table columns.
  const openItemEdit = useCallback((item: GaItemRow) => setItemSheet({ item }), []);
  const openMoveFor = useCallback((item: GaItemRow) => setMovementSheet({ itemId: item.id }), []);
  const openOpnameFor = useCallback((item: GaItemRow) => setOpnameSheet({ itemId: item.id }), []);
  const openPreview = useCallback((item: ItemPreview) => setPreview(item), []);

  let actions: ReactNode = null;
  if (canEdit && tab === 'items') {
    actions = (
      <Button onClick={() => setItemSheet({ item: null })}>
        <Plus aria-hidden />
        Item Baru
      </Button>
    );
  } else if (canEdit && (tab === 'movements' || tab === 'dashboard')) {
    actions = (
      <Button onClick={() => setMovementSheet({})} disabled={noLocations}>
        <ArrowLeftRight aria-hidden />
        Catat Pergerakan
      </Button>
    );
  }

  return (
    // Manual activation: automatic activation fires onValueChange on mousedown
    // AND focus before the URL-driven value updates → two history entries.
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader title="Inventaris Kantor" description={DESCRIPTION[tab]} actions={actions}>
        <div className="max-w-full overflow-x-auto">
          <TabsList variant="underline" aria-label="Bagian inventaris kantor">
            <TabsTrigger value="dashboard">Dashboard Stok</TabsTrigger>
            <TabsTrigger value="items">Item</TabsTrigger>
            <TabsTrigger value="movements">Pergerakan</TabsTrigger>
            <TabsTrigger value="tools">Opname &amp; Ekspor</TabsTrigger>
          </TabsList>
        </div>
      </PageHeader>

      {noLocations && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-md border border-danger/40 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Belum ada <strong>lokasi gudang</strong>. Stok tidak bisa dicatat sampai lokasi dibuat — tambahkan minimal satu
            lokasi di{' '}
            {canOpenMaster ? (
              <Link to="/ga/master" className="font-medium underline underline-offset-2">
                Data Induk Aset → Lokasi
              </Link>
            ) : (
              <strong>Data Induk Aset → Lokasi</strong>
            )}
            .
          </p>
        </div>
      )}

      <TabsContent value="dashboard" className="mt-0">
        <GaInventoryDashboard
          onShowMovements={() => changeTab('movements')}
          onShowLowStock={() => navigate({ [TAB_PARAM]: 'items', stockStatus: 'low' })}
        />
      </TabsContent>

      <TabsContent value="items" className="mt-0">
        <GaItemsTab
          canEdit={canEdit}
          onCreate={() => setItemSheet({ item: null })}
          onEdit={openItemEdit}
          onMove={openMoveFor}
          onOpname={openOpnameFor}
          onPreview={openPreview}
        />
      </TabsContent>

      <TabsContent value="movements" className="mt-0">
        <GaMovementsTab onCreate={canEdit && !noLocations ? () => setMovementSheet({}) : undefined} />
      </TabsContent>

      <TabsContent value="tools" className="mt-0">
        <GaInventoryTools canEdit={canEdit} hasLocations={!noLocations} onOpname={() => setOpnameSheet({})} />
      </TabsContent>

      {/* Sheets mount per open (keyed) so each form starts fresh. */}
      {canEdit && itemSheet && (
        <GaItemFormSheet key={itemSheet.item?.id ?? 'new'} open item={itemSheet.item} onClose={() => setItemSheet(null)} />
      )}
      {canEdit && movementSheet && (
        <GaMovementFormSheet
          key={movementSheet.itemId ?? 'new'}
          open
          itemId={movementSheet.itemId}
          onClose={() => setMovementSheet(null)}
        />
      )}
      {canEdit && opnameSheet && (
        <GaOpnameFormSheet
          key={opnameSheet.itemId ?? 'new'}
          open
          itemId={opnameSheet.itemId}
          onClose={() => setOpnameSheet(null)}
        />
      )}
      <ItemImageDialog item={preview} onClose={() => setPreview(null)} />
    </Tabs>
  );
};
