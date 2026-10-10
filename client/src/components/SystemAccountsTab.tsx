import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const ROLE_GROUPS: { title: string; description: string; roles: string[] }[] = [
  {
    title: 'Kas & Bank',
    description: 'Akun kas, bank, dan setara kas untuk transaksi pembayaran',
    roles: ['CASH'],
  },
  {
    title: 'Piutang & Hutang',
    description: 'Akun piutang usaha, hutang usaha, dan penyisihannya',
    roles: ['AR', 'AP', 'ALLOWANCE_DOUBTFUL', 'BAD_DEBT_EXPENSE'],
  },
  {
    title: 'Persediaan & HPP',
    description: 'Akun persediaan barang dan beban pokok penjualan',
    roles: ['INVENTORY', 'COGS', 'INVENTORY_VARIANCE'],
  },
  {
    title: 'Pendapatan',
    description: 'Akun pendapatan usaha, jasa, diskon, dan retur',
    roles: ['SALES', 'SERVICE_REVENUE', 'SALES_DISCOUNT', 'SALES_RETURN'],
  },
  {
    title: 'Pajak',
    description: 'Akun PPN masukan/keluaran dan beban pajak penghasilan',
    roles: ['TAX_INPUT', 'TAX_OUTPUT', 'INCOME_TAX_EXPENSE'],
  },
  {
    title: 'Uang Muka (Deposit)',
    description: 'Akun uang muka pembelian dan penjualan',
    roles: ['VENDOR_DEPOSIT', 'CUSTOMER_DEPOSIT'],
  },
  {
    title: 'Produksi',
    description: 'Akun biaya konversi dan selisih produksi',
    roles: ['PRODUCTION_CONVERSION'],
  },
  {
    title: 'Aset Tetap & Depresiasi',
    description: 'Akun pencatatan aset tetap, akumulasi penyusutan, dan beban penyusutan',
    roles: ['FIXED_ASSET', 'ACCUM_DEPRECIATION', 'DEPRECIATION_EXPENSE'],
  },
  {
    title: 'Biaya Bank & Bunga',
    description: 'Akun administrasi bank, bunga pinjaman, dan pendapatan bunga',
    roles: ['BANK_CHARGE', 'INTEREST_EXPENSE', 'INTEREST_INCOME'],
  },
  {
    title: 'Akrual & Dibayar Dimuka',
    description: 'Akun biaya dibayar dimuka dan hutang beban akrual',
    roles: ['PREPAID_EXPENSE', 'ACCRUED_EXPENSE'],
  },
  {
    title: 'Selisih Kurs',
    description: 'Akun laba/rugi selisih kurs terealisasi dan belum terealisasi',
    roles: ['FX_GAIN_LOSS', 'FX_UNREALIZED'],
  },
  {
    title: 'Pendapatan & Beban Lain-lain',
    description: 'Akun pendapatan/beban di luar usaha utama',
    roles: ['OTHER_INCOME', 'OTHER_EXPENSE', 'SHIPPING_EXPENSE', 'ROUNDING_ACCOUNT'],
  },
  {
    title: 'Ekuitas',
    description: 'Akun modal, laba ditahan, dan prive pemilik',
    roles: ['OPENING_EQUITY', 'RETAINED_EARNINGS', 'CURRENT_PROFIT', 'OWNER_DRAWING'],
  },
];

export const SystemAccountsTab: React.FC = () => {
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
            throw new Error(`Role "${meta.label}" wajib. Pilih akun lain, tidak boleh dikosongkan.`);
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
      toast.success('Konfigurasi akun sistem berhasil disimpan.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.message || 'Gagal menyimpan konfigurasi.');
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
    if (!searchTerm) return ROLE_GROUPS;
    const q = searchTerm.toLowerCase();
    return ROLE_GROUPS.map((group) => ({
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
  }, [searchTerm, data]);

  if (isLoading) {
    return <LoadingState label="Memuat akun sistem…" />;
  }

  if (isError) {
    return (
      <EmptyState
        kind="error"
        title="Akun sistem gagal dimuat"
        description="Pemetaan akun tidak ditampilkan karena permintaan ke server gagal. Periksa koneksi lalu coba lagi."
        action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Akun Sistem</h2>
          <p className="text-sm text-muted-foreground">
            Konfigurasi akun COA yang digunakan sistem untuk auto GL posting.
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Simpan Perubahan
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Role</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terkonfigurasi</p>
          <p className="text-xl font-bold text-success-text mt-0.5">{stats.configured}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Wajib</p>
          <p className="text-xl font-bold text-primary mt-0.5">{stats.requiredConfigured}/{stats.required}</p>
        </div>
        <div className={cn(
          'border rounded-lg p-3',
          stats.requiredConfigured === stats.required
            ? 'bg-success-subtle border-success/30'
            : 'bg-warning-subtle border-warning/30'
        )}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {stats.requiredConfigured === stats.required ? (
              <>
                <CheckCircle2 size={16} className="text-success-text" />
                <span className="text-sm font-semibold text-success-text">Lengkap</span>
              </>
            ) : (
              <>
                <AlertTriangle size={16} className="text-warning-text" />
                <span className="text-sm font-semibold text-warning-text">Belum Lengkap</span>
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
          placeholder="Cari role akun..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Groups */}
      {filteredGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.title);
        const groupStatus = getGroupStatus(group.roles);

        return (
          <div key={group.title} className="bg-card rounded-xl border border-border overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.title)}
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
                                Wajib
                              </span>
                            )}
                            {meta.multiAccount && (
                              <span className="text-xs font-medium text-primary-subtle-foreground bg-primary-subtle px-1.5 py-0.5 rounded">
                                Multi
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
                                      label={`Akun untuk ${meta.label} ${idx + 1}`}
                                      value={accId}
                                      allLabel="-- Pilih Akun --"
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
                                    toast.error('Tidak ada akun tersedia untuk ditambahkan.');
                                  }
                                }}
                                className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
                              >
                                <Plus size={12} />
                                Tambah Akun
                              </button>
                            </div>
                          ) : (
                            // Single account selector
                            <div className="space-y-1">
                              <ComboboxFilter
                                className={cn(isMissing && '[&_button]:border-warning-border [&_button]:bg-warning-subtle')}
                                label={`Akun untuk ${meta.label}`}
                                value={selectedIds[0] ?? ''}
                                allLabel="-- Pilih Akun --"
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
                                  title="Lepas akun dari role ini"
                                >
                                  <X size={12} />
                                  Lepas
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
            Simpan Perubahan
          </Button>
        </div>
      )}
    </div>
  );
};
