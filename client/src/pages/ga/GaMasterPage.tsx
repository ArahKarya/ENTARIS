/** GA master data (/ga/master), one tab per entity. Writes need ga_master edit. */
import { useSearchParams } from 'react-router-dom';
import { can } from '@/lib/permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared';
import { DEFAULT_MASTER_TAB, MASTER_ENTITIES, findMasterEntity } from '@/components/ga/assets/master-config';
import { GaMasterTab } from '@/components/ga/assets/GaMasterTab';
import { useTranslation } from 'react-i18next';

const TAB_PARAM = 'tab';

export const GaMasterPage = () => {
  const { t } = useTranslation('eam');
  const [searchParams, setSearchParams] = useSearchParams();
  const active = findMasterEntity(searchParams.get(TAB_PARAM));
  const canEdit = can('ga_master', 'edit');

  const changeTab = (next: string) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === DEFAULT_MASTER_TAB) params.delete(TAB_PARAM);
      else params.set(TAB_PARAM, next);
      return params;
    });

  return (
    // Manual activation: one history entry per tab change.
    <Tabs value={active.id} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader title={t('master.page.title')} description={t('master.page.description')}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="underline" aria-label={t('master.page.tabsLabel')} className="w-max">
            {MASTER_ENTITIES.map((e) => (
              <TabsTrigger key={e.id} value={e.id}>
                {e.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </PageHeader>
      {MASTER_ENTITIES.map((e) => (
        <TabsContent key={e.id} value={e.id} className="mt-0">
          {e.id === active.id && <GaMasterTab entity={e} canEdit={canEdit} />}
        </TabsContent>
      ))}
    </Tabs>
  );
};
