import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '../lib/api';
import { Save, Loader2, AlertTriangle, Plus, X, ChevronDown, ChevronRight, CheckCircle2, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { ComboboxFilter, EmptyState, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface RoleMeta {
  key: string;
  label: string;
  description: string;
  multiAccount: boolean;
  required: boolean;
  expectedRootType: string;
}

interface MappingEntry {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  sortOrder: number;
}

interface SystemAccountsData {
  mappings: Record<string, MappingEntry[]>;
  roles: RoleMeta[];
}

interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
  rootType: string;
  isGroup: boolean;
  isActive: boolean;
}

type RoleGroupKey =
  | 'cash'
  | 'receivablesPayables'
  | 'inventory'
  | 'revenue'
  | 'tax'
  | 'deposits'
  | 'production'
  | 'fixedAssets'
  | 'bank'
  | 'accruals'
  | 'fx'
  | 'other'
  | 'equity';

/** Titles and descriptions live under systemAccountsTab.groups.<key>. */
const ROLE_GROUPS: { key: RoleGroupKey; roles: string[] }[] = [
  { key: 'cash', roles: ['CASH'] },
  { key: 'receivablesPayables', roles: ['AR', 'AP', 'ALLOWANCE_DOUBTFUL', 'BAD_DEBT_EXPENSE'] },
  { key: 'inventory', roles: ['INVENTORY', 'COGS', 'INVENTORY_VARIANCE'] },
  { key: 'revenue', roles: ['SALES', 'SERVICE_REVENUE', 'SALES_DISCOUNT', 'SALES_RETURN'] },
  { key: 'tax', roles: ['TAX_INPUT', 'TAX_OUTPUT', 'INCOME_TAX_EXPENSE'] },
  { key: 'deposits', roles: ['VENDOR_DEPOSIT', 'CUSTOMER_DEPOSIT'] },
  { key: 'production', roles: ['PRODUCTION_CONVERSION'] },
  { key: 'fixedAssets', roles: ['FIXED_ASSET', 'ACCUM_DEPRECIATION', 'DEPRECIATION_EXPENSE'] },
  { key: 'bank', roles: ['BANK_CHARGE', 'INTEREST_EXPENSE', 'INTEREST_INCOME'] },
  { key: 'accruals', roles: ['PREPAID_EXPENSE', 'ACCRUED_EXPENSE'] },
  { key: 'fx', roles: ['FX_GAIN_LOSS', 'FX_UNREALIZED'] },
  { key: 'other', roles: ['OTHER_INCOME', 'OTHER_EXPENSE', 'SHIPPING_EXPENSE', 'ROUNDING_ACCOUNT'] },
  { key: 'equity', roles: ['OPENING_EQUITY', 'RETAINED_EARNINGS', 'CURRENT_PROFIT', 'OWNER_DRAWING'] },
];

export const SystemAccountsTab: React.FC = () => {
  const { t } = useTranslation('finance');
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<Record<string, string[]>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<SystemAccountsData>({
    queryKey: ['system-accounts'],
    queryFn: async () => {
      const res = await api.get('/system-accounts');
      return res.data;
    },
  });

  const { data: accounts } = useQuery<AccountOption[]>({
    queryKey: ['coa-options'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return res.data.filter((a: AccountOption) => a.isActive);
    },
  });

  // Initialize edit state from server data
  const currentMappings = useMemo(() => {
    if (!data) return {};
    const result: Record<string, string[]> = {};
    for (const role of data.roles) {
      const entries = data.mappings[role.key] ?? [];
      result[role.key] = entries.map((e) => e.accountId);
    }
    return result;
  }, [data]);

  // Summary stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, configured: 0, required: 0, requiredConfigured: 0 };
    const total = data.roles.length;
    const configured = data.roles.filter((r) => {
      const ids = editState[r.key] ?? currentMappings[r.key] ?? [];
      return ids.length > 0;
    }).length;
    const required = data.roles.filter((r) => r.required).length;
    const requiredConfigured = data.roles.filter((r) => {
      if (!r.required) return false;
      const ids = editState[r.key] ?? currentMappings[r.key] ?? [];
      return ids.length > 0;
    }).length;
    return { total, configured, required, requiredConfigured };
  }, [data, editState, currentMappings]);

  const getEditValue = (role: string): string[] => {
    return editState[role] ?? currentMappings[role] ?? [];
  };

  const updateRole = (role: string, accountIds: string[]) => {
    setEditState((prev) => ({ ...prev, [role]: accountIds }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mappings: { role: string; accountId: string; sortOrder: number }[] = [];
      const clearRoles: string[] = [];
      for (const [role, accountIds] of Object.entries(editState)) {
        if (accountIds.length === 0) {
          // Role dikosongkan → minta backend lepas. Role wajib tidak boleh dikosongkan.
          const meta = getRoleMeta(role);
          if (meta?.required) {
            throw new Error(t('systemAccountsTab.errors.requiredRole', { role: meta.label }));
          }
          clearRoles.push(role);
        } else {
          accountIds.forEach((accountId, idx) => {
            mappings.push({ role, accountId, sortOrder: idx });
          });
        }
      }
      if (mappings.length === 0 && clearRoles.length === 0) return;
      await api.put('/system-accounts', { mappings, clearRoles });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-accounts'] });
      setEditState({});
      setHasChanges(false);
      toast.success(t('systemAccountsTab.toast.saved'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message || t('systemAccountsTab.toast.saveFailed'));
    },
  });

  const getRoleMeta = (key: string): RoleMeta | undefined => {
    return data?.roles.find((r) => r.key === key);
  };

  const getFilteredAccounts = (expectedRootType: string): AccountOption[] => {
    if (!accounts) return [];
    return accounts
      .filter((a) => a.rootType === expectedRootType && !a.isGroup)
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }));
  };

  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const getGroupStatus = (roles: string[]): { total: number; configured: number; allRequired: boolean } => {
    let total = 0;
    let configured = 0;
    let allRequired = true;
    for (const roleKey of roles) {
      const meta = getRoleMeta(roleKey);
      if (!meta) continue;
      total++;
      const ids = getEditValue(roleKey);
      if (ids.length > 0) configured++;
      if (meta.required && ids.length === 0) allRequired = false;
    }
    return { total, configured, allRequired };
  };

  // Filter groups/roles by search
  const filteredGroups = useMemo(() => {
    const groups = ROLE_GROUPS.map((group) => ({
      ...group,
      title: t(`systemAccountsTab.groups.${group.key}.title`),
      description: t(`systemAccountsTab.groups.${group.key}.description`),
    }));
    if (!searchTerm) return groups;
    const q = searchTerm.toLowerCase();
    return groups.map((group) => ({
      ...group,
      roles: group.roles.filter((roleKey) => {
        const meta = data?.roles.find((r) => r.key === roleKey);
        if (!meta) return false;
        return (
          meta.label.toLowerCase().includes(q) ||
          meta.description.toLowerCase().includes(q) ||
          meta.key.toLowerCase().includes(q) ||
          group.title.toLowerCase().includes(q)
        );
      }),
    })).filter((group) => group.roles.length > 0);
  }, [searchTerm, data, t]);

  if (isLoading) {
    return <LoadingState label={t('systemAccountsTab.loading')} />;
  }

  if (isError) {
    return (
      <EmptyState
        kind="error"
        title={t('systemAccountsTab.error.title')}
        description={t('systemAccountsTab.error.description')}
        action={<Button variant="outline" onClick={() => refetch()}>{t('systemAccountsTab.error.retry')}</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('systemAccountsTab.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('systemAccountsTab.description')}
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {t('systemAccountsTab.save')}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('systemAccountsTab.stats.total')}</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('systemAccountsTab.stats.configured')}</p>
          <p className="text-xl font-bold text-success-text mt-0.5">{stats.configured}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('systemAccountsTab.stats.required')}</p>
          <p className="text-xl font-bold text-primary mt-0.5">{stats.requiredConfigured}/{stats.required}</p>
        </div>
        <div className={cn(
          'border rounded-lg p-3',
          stats.requiredConfigured === stats.required
            ? 'bg-success-subtle border-success/30'
            : 'bg-warning-subtle border-warning/30'
        )}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('systemAccountsTab.stats.status')}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {stats.requiredConfigured === stats.required ? (
              <>
                <CheckCircle2 size={16} className="text-success-text" />
                <span className="text-sm font-semibold text-success-text">{t('systemAccountsTab.stats.complete')}</span>
              </>
            ) : (
              <>
                <AlertTriangle size={16} className="text-warning-text" />
                <span className="text-sm font-semibold text-warning-text">{t('systemAccountsTab.stats.incomplete')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder={t('systemAccountsTab.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Groups */}
      {filteredGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        const groupStatus = getGroupStatus(group.roles);

        return (
          <div key={group.key} className="bg-card rounded-xl border border-border overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted border-b border-border hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isCollapsed ? (
                  <ChevronRight size={16} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={16} className="text-muted-foreground" />
                )}
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-sm',
                  groupStatus.configured === groupStatus.total
                    ? 'bg-success-subtle text-success-text'
                    : groupStatus.configured > 0
                      ? 'bg-warning-subtle text-warning-text'
                      : 'bg-muted text-muted-foreground',
                )}>
                  {groupStatus.configured}/{groupStatus.total}
                </span>
              </div>
            </button>

            {/* Role items */}
            {!isCollapsed && (
              <div className="divide-y divide-border">
                {group.roles.map((roleKey) => {
                  const meta = getRoleMeta(roleKey);
                  if (!meta) return null;
                  const selectedIds = getEditValue(roleKey);
                  const isMissing = meta.required && selectedIds.length === 0;
                  const isConfigured = selectedIds.length > 0;
                  const filteredAccounts = getFilteredAccounts(meta.expectedRootType);

                  return (
                    <div key={roleKey} className={cn('px-4 py-3', isMissing && 'bg-warning-subtle/30')}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isConfigured ? (
                              <CheckCircle2 size={14} className="text-success-text flex-shrink-0" />
                            ) : isMissing ? (
                              <AlertTriangle size={14} className="text-warning-text flex-shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-border flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium text-foreground">{meta.label}</span>
                            {meta.required && (
                              <span className="text-xs font-medium text-primary bg-primary-subtle px-1.5 py-0.5 rounded">
                                {t('systemAccountsTab.required')}
                              </span>
                            )}
                            {meta.multiAccount && (
                              <span className="text-xs font-medium text-primary-subtle-foreground bg-primary-subtle px-1.5 py-0.5 rounded">
                                {t('systemAccountsTab.multi')}
                              </span>
                            )}
                            <span className="text-xs font-mono text-muted-foreground uppercase">
                              {meta.expectedRootType}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">{meta.description}</p>
                        </div>

                        <div className="flex-shrink-0 w-72">
                          {meta.multiAccount ? (
                            // Multi-account selector
                            <div className="space-y-1.5">
                              {selectedIds.map((accId, idx) => {
                                const acc = accounts?.find((a) => a.id === accId);
                                return (
                                  <div key={`${accId}-${idx}`} className="flex items-center gap-1">
                                    <ComboboxFilter
                                      className="flex-1"
                                      label={t('systemAccountsTab.accountFor', { role: meta.label, n: idx + 1 })}
                                      value={accId}
                                      allLabel={t('systemAccountsTab.chooseAccount')}
                                      options={[
                                        { value: accId, label: acc ? `${acc.accountNumber} - ${acc.name}` : accId },
                                        ...filteredAccounts
                                          .filter((a) => a.id !== accId && !selectedIds.includes(a.id))
                                          .map((a) => ({ value: a.id, label: `${a.accountNumber} - ${a.name}` })),
                                      ]}
                                      onChange={(v) => {
                                        // The combobox "x" removes this account row.
                                        if (!v) {
                                          updateRole(roleKey, selectedIds.filter((_, i) => i !== idx));
                                          return;
                                        }
                                        const newIds = [...selectedIds];
                                        newIds[idx] = v;
                                        updateRole(roleKey, newIds);
                                      }}
                                    />
                                  </div>
                                );
                              })}
                              <button
                                onClick={() => {
                                  const unused = filteredAccounts.find(
                                    (a) => !selectedIds.includes(a.id),
                                  );
                                  if (unused) {
                                    updateRole(roleKey, [...selectedIds, unused.id]);
                                  } else {
                                    toast.error(t('systemAccountsTab.toast.noAccountAvailable'));
                                  }
                                }}
                                className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
                              >
                                <Plus size={12} />
                                {t('systemAccountsTab.addAccount')}
                              </button>
                            </div>
                          ) : (
                            // Single account selector
                            <div className="space-y-1">
                              <ComboboxFilter
                                className={cn(isMissing && '[&_button]:border-warning-border [&_button]:bg-warning-subtle')}
                                label={t('systemAccountsTab.accountForSingle', { role: meta.label })}
                                value={selectedIds[0] ?? ''}
                                allLabel={t('systemAccountsTab.chooseAccount')}
                                options={filteredAccounts.map((acc) => ({
                                  value: acc.id,
                                  label: `${acc.accountNumber} - ${acc.name}`,
                                }))}
                                onChange={(v) => updateRole(roleKey, v ? [v] : [])}
                              />
                              {isConfigured && !meta.required && (
                                <button
                                  onClick={() => updateRole(roleKey, [])}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-danger-text transition-colors"
                                  title={t('systemAccountsTab.unassignTitle')}
                                >
                                  <X size={12} />
                                  {t('systemAccountsTab.unassign')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Floating save button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button size="lg" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} className="shadow-[var(--shadow-3)]">
            {!saveMutation.isPending && <Save aria-hidden />}
            {t('systemAccountsTab.save')}
          </Button>
        </div>
      )}
    </div>
  );
};
