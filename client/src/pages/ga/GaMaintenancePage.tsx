/**
 * Maintenance hub (/ga/maintenance): work orders, preventive schedules, service/tax requests.
 * ?wo=<id> opens a WO on any tab. Writes need ga_maintenance edit; the requests tab needs
 * ga_vehicle; creating an MR from a WO needs ga_material_request edit.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus } from 'lucide-react';
import { can } from '@/lib/permissions';
import { LIST_PARAM } from '@/hooks/useListState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, type Paginated } from '@/components/shared';
import { WorkOrdersTab } from '@/components/ga/maintenance/WorkOrdersTab';
import { SchedulesTab } from '@/components/ga/maintenance/SchedulesTab';
import { SCHEDULE_FILTER_KEYS, WO_FILTER_KEYS } from '@/components/ga/maintenance/queries';
import { WorkOrderDetailSheet } from '@/components/ga/maintenance/WorkOrderDetailSheet';
import { CreateWorkOrderModal } from '@/components/ga/maintenance/wo-forms';
import { ScheduleFormModal } from '@/components/ga/maintenance/schedule-forms';
import type { WoPrefill, WorkOrderRow } from '@/components/ga/maintenance/wo-meta';
import { RequestsTab } from './GaRequestsPage';
import { REQUEST_FILTER_KEYS } from './requests/types';
import { CreateRequestModal } from './requests/CreateRequestModal';
import { useTranslation } from 'react-i18next';

type Tab = 'wo' | 'schedules' | 'requests';
type Creating = { kind: 'wo'; prefill?: WoPrefill } | { kind: 'schedule' } | { kind: 'request'; mode: 'SERVICE' | 'TAX' } | null;

const TAB_PARAM = 'tab';
const WO_PARAM = 'wo';
/** Params owned by the tab lists (cleared on tab switch). */
const LIST_KEYS = [
  LIST_PARAM.page,
  LIST_PARAM.search,
  LIST_PARAM.sort,
  ...new Set<string>([...WO_FILTER_KEYS, ...SCHEDULE_FILTER_KEYS, ...REQUEST_FILTER_KEYS]),
];

export const GaMaintenancePage = () => {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = can('ga_maintenance', 'edit');
  const canViewRequests = can('ga_vehicle', 'view');
  const canEditRequests = can('ga_vehicle', 'edit');
  const canCreateMr = can('ga_material_request', 'edit');
  const canViewMr = can('ga_material_request', 'view');

  const rawTab = searchParams.get(TAB_PARAM);
  const tab: Tab = rawTab === 'schedules' ? 'schedules' : rawTab === 'requests' && canViewRequests ? 'requests' : 'wo';
  const woId = searchParams.get(WO_PARAM);
  const [creating, setCreating] = useState<Creating>(null);

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of LIST_KEYS) params.delete(key);
      params.delete(WO_PARAM);
      if (next === 'wo') params.delete(TAB_PARAM);
      else params.set(TAB_PARAM, next);
      return params;
    });
  };

  const openWorkOrder = useCallback(
    (wo: Pick<WorkOrderRow, 'id'>) =>
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set(WO_PARAM, wo.id);
        return params;
      }),
    [setSearchParams],
  );
  const closeWorkOrder = () =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete(WO_PARAM);
        return params;
      },
      { replace: true },
    );

  const createWorkOrderFromSchedule = useCallback((prefill: WoPrefill) => setCreating({ kind: 'wo', prefill }), []);

  // Technician name for the sheet: the detail endpoint has only the id, the list rows carry the name.
  const assigneeName = useMemo(() => {
    if (!woId) return null;
    const lists = queryClient.getQueriesData<Paginated<WorkOrderRow>>({ queryKey: ['ga-work-orders', 'list'] });
    for (const [, data] of lists) {
      const row = data?.data?.find((r) => r.id === woId);
      if (row?.assignee?.fullName) return row.assignee.fullName;
    }
    return null;
    // Re-read when the list cache changes (cheap: at most a few cached pages).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId, queryClient, searchParams]);

  const headerActions = (() => {
    if (tab === 'wo' && canEdit)
      return (
        <Button onClick={() => setCreating({ kind: 'wo' })}>
          <Plus aria-hidden />
          {t('maintenance.page.createWo')}
        </Button>
      );
    if (tab === 'schedules' && canEdit)
      return (
        <Button onClick={() => setCreating({ kind: 'schedule' })}>
          <CalendarPlus aria-hidden />
          {t('maintenance.page.createSchedule')}
        </Button>
      );
    if (tab === 'requests' && canEditRequests)
      return (
        <>
          <Button variant="outline" onClick={() => setCreating({ kind: 'request', mode: 'TAX' })}>
            <Plus aria-hidden />
            <span className="sm:hidden">{t('maintenance.page.taxShort')}</span>
            <span className="hidden sm:inline">{t('maintenance.page.requestTax')}</span>
          </Button>
          <Button onClick={() => setCreating({ kind: 'request', mode: 'SERVICE' })}>
            <Plus aria-hidden />
            {t('maintenance.page.requestService')}
          </Button>
        </>
      );
    return null;
  })();

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('maintenance.page.title')}
        description={t('maintenance.page.description')}
        actions={headerActions}
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList variant="underline" aria-label={t('maintenance.page.tabsLabel')}>
          <TabsTrigger value="wo">{t('maintenance.page.tabWo')}</TabsTrigger>
          <TabsTrigger value="schedules">{t('maintenance.page.tabSchedules')}</TabsTrigger>
          {canViewRequests && <TabsTrigger value="requests">{t('maintenance.page.tabRequests')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="wo" className="mt-5">
          {tab === 'wo' && (
            <WorkOrdersTab canEdit={canEdit} onOpen={openWorkOrder} onCreate={() => setCreating({ kind: 'wo' })} />
          )}
        </TabsContent>
        <TabsContent value="schedules" className="mt-5">
          {tab === 'schedules' && (
            <SchedulesTab
              canEdit={canEdit}
              onCreate={() => setCreating({ kind: 'schedule' })}
              onCreateWorkOrder={createWorkOrderFromSchedule}
            />
          )}
        </TabsContent>
        {canViewRequests && (
          <TabsContent value="requests" className="mt-5">
            {tab === 'requests' && (
              <RequestsTab canEdit={canEditRequests} onCreate={(mode) => setCreating({ kind: 'request', mode })} />
            )}
          </TabsContent>
        )}
      </Tabs>

      <WorkOrderDetailSheet
        id={woId}
        onClose={closeWorkOrder}
        canEdit={canEdit}
        canCreateMr={canCreateMr}
        canViewMr={canViewMr}
        assigneeName={assigneeName}
      />

      {creating?.kind === 'wo' && <CreateWorkOrderModal prefill={creating.prefill} onClose={() => setCreating(null)} />}
      {creating?.kind === 'schedule' && <ScheduleFormModal onClose={() => setCreating(null)} />}
      {creating?.kind === 'request' && <CreateRequestModal mode={creating.mode} onClose={() => setCreating(null)} />}
    </div>
  );
};
