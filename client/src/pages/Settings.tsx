/**
 * Pengaturan — settings shell.
 *
 * Desktop: grouped vertical nav on the left. Mobile: a section select.
 * The active section lives in the URL (?tab=company|fiscal|tax|accounts|roles|
 * notifications|backup|agentic (AIRA MCP)|appearance|about); unknown or hidden ids fall
 * back to "company".
 */
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '../lib/utils';
import { cap } from '../lib/permissions';
import { resolveSettingsTab, visibleSettingsNav, DEFAULT_SETTINGS_TAB, type SettingsTabId } from '../components/settings/settingsNav';
import { FiscalYearsTab } from './settings/FiscalYearsTab';
import { CompanySettingsTab } from './settings/CompanySettingsTab';
import { SystemAccountsTab } from '../components/SystemAccountsTab';
import { TaxConfigTab } from './settings/TaxConfigTab';
import { BackupTab } from './settings/BackupTab';
import { AboutTab } from './settings/AboutTab';
import { NotificationsTab } from './settings/NotificationsTab';
import { RolePermissionsTab } from './settings/RolePermissionsTab';
import { AgenticSystemTab } from './settings/AgenticSystemTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { PaymentRequestTypesTab } from './settings/PaymentRequestTypesTab';

const PANELS: Record<SettingsTabId, React.FC> = {
  company: CompanySettingsTab,
  fiscal: FiscalYearsTab,
  tax: TaxConfigTab,
  accounts: SystemAccountsTab,
  'payment-request-types': PaymentRequestTypesTab,
  roles: RolePermissionsTab,
  notifications: NotificationsTab,
  backup: BackupTab,
  agentic: AgenticSystemTab,
  appearance: AppearanceTab,
  about: AboutTab,
};

export const SettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const canManageRbac = cap('rbac.manage');
  const nav = useMemo(() => visibleSettingsNav(canManageRbac), [canManageRbac]);
  const active = resolveSettingsTab(searchParams.get('tab'), nav);
  const Panel = PANELS[active.id];

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === DEFAULT_SETTINGS_TAB) params.delete('tab');
      else params.set('tab', next);
      return params;
    });
  };

  return (
    <div className="pb-8">
      <PageHeader title="Pengaturan" description="Konfigurasi perusahaan, akses, dan sistem ERP." icon={Settings} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        {/* Mobile / tablet: section select */}
        <div className="lg:hidden">
          <label htmlFor="settings-section" className="sr-only">Bagian pengaturan</label>
          <Select value={active.id} onValueChange={changeTab}>
            <SelectTrigger id="settings-section" aria-label="Bagian pengaturan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nav.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: grouped vertical nav */}
        <nav aria-label="Bagian pengaturan" className="hidden lg:block">
          <div className="sticky top-4 space-y-5">
            {nav.map((group) => {
              const groupId = `settings-group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;
              return (
                <div key={group.label}>
                  <p id={groupId} className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <ul aria-labelledby={groupId} className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = item.id === active.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => changeTab(item.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              isActive
                                ? 'bg-primary-subtle font-medium text-primary-subtle-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                          >
                            <item.icon className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        <section aria-labelledby="settings-section-title" className="min-w-0 space-y-5">
          <div>
            <h2 id="settings-section-title" className="font-heading text-lg font-semibold text-foreground">
              {active.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
          </div>
          <Panel key={active.id} />
        </section>
      </div>
    </div>
  );
};
