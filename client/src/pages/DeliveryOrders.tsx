/**
 * Delivery orders: official DO (cuts stock, then invoiced; no ?tab) and temporary SJS (no stock/GL,
 * linked to a DO; ?tab=sjs). Switching tabs drops list params because both lists share param names.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { LIST_PARAM } from '@/hooks/useListState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared';
import DeliveryOrderModal from '@/components/DeliveryOrderModal';
import TemporaryDeliveryNoteModal from '@/components/TemporaryDeliveryNoteModal';
import { DeliveryOrdersList } from './DeliveryOrdersOfficial';
import { SJS_REMINDER_DAYS, TemporaryDeliveryNotesList, type SjsSummary } from './TemporaryDeliveryNotes';

type Tab = 'official' | 'sjs';

const TAB_PARAM = 'tab';
/** List params owned by the active tab's list (cleared on tab switch). */
const LIST_KEYS = [LIST_PARAM.page, LIST_PARAM.search, LIST_PARAM.sort, 'status', 'partyId', 'startDate', 'endDate'];

export const DeliveryOrders = () => {
  const { t } = useTranslation('sales');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get(TAB_PARAM) === 'sjs' ? 'sjs' : 'official';
  const [createOpen, setCreateOpen] = useState<Tab | null>(null);
  const canCreateSjs = can('delivery_order', 'edit');

  const { data: sjsSummary } = useQuery({
    queryKey: ['temporary-delivery-notes-summary', SJS_REMINDER_DAYS],
    queryFn: async () =>
      (await api.get<SjsSummary>('/temporary-delivery-notes/summary', { params: { days: SJS_REMINDER_DAYS } })).data,
    refetchInterval: 60_000,
  });

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of LIST_KEYS) params.delete(key);
      if (next === 'sjs') params.set(TAB_PARAM, 'sjs');
      else params.delete(TAB_PARAM);
      return params;
    });
  };

  const openSjs = sjsSummary?.open ?? 0;

  return (
    // Manual activation: with automatic activation Radix fires onValueChange on
    // mousedown AND focus before the URL-driven value updates → two history entries.
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title={t('deliveryOrdersPage.title')}
        description={
          tab === 'official'
            ? t('deliveryOrdersPage.descriptionOfficial')
            : t('deliveryOrdersPage.descriptionSjs')
        }
        actions={
          tab === 'official' ? (
            <Button onClick={() => setCreateOpen('official')}>
              <Plus aria-hidden />
              {t('deliveryOrdersPage.createOfficial')}
            </Button>
          ) : canCreateSjs ? (
            <Button onClick={() => setCreateOpen('sjs')}>
              <Plus aria-hidden />
              <span className="sm:hidden">{t('deliveryOrdersPage.createSjsShort')}</span>
              <span className="hidden sm:inline">{t('deliveryOrdersPage.createSjs')}</span>
            </Button>
          ) : null
        }
      >
        <TabsList variant="underline" aria-label={t('deliveryOrdersPage.tabsLabel')}>
          <TabsTrigger value="official">{t('deliveryOrdersPage.tabOfficial')}</TabsTrigger>
          <TabsTrigger value="sjs">
            {t('deliveryOrdersPage.tabSjs')}
            {openSjs > 0 && (
              <span className="num rounded-sm bg-warning-subtle px-1.5 text-xs font-medium leading-5 text-warning-text">
                {formatNumber(openSjs)}
                <span className="sr-only"> {t('deliveryOrdersPage.open')}</span>
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </PageHeader>

      <TabsContent value="official" className="mt-0">
        <DeliveryOrdersList onCreate={() => setCreateOpen('official')} />
      </TabsContent>
      <TabsContent value="sjs" className="mt-0">
        <TemporaryDeliveryNotesList
          summary={sjsSummary}
          onCreate={canCreateSjs ? () => setCreateOpen('sjs') : undefined}
        />
      </TabsContent>

      {/* Conditional render — state resets cleanly on each open. */}
      {createOpen === 'official' && <DeliveryOrderModal onClose={() => setCreateOpen(null)} />}
      {createOpen === 'sjs' && <TemporaryDeliveryNoteModal onClose={() => setCreateOpen(null)} />}
    </Tabs>
  );
};

export default DeliveryOrders;
