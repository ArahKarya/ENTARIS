/**
 * Persetujuan (/approvals) — approval inbox (ApprovalPanel: all document
 * types, status sub-tabs, approve / reject / request-revision) plus the
 * approval rules table. Tab is kept in the URL (?tab=rules); ?request=<id>
 * deep-links into a request (from notifications).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { can, cap } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, DataTable, Field, PageHeader, RowActions, StatusBadge } from '@/components/shared';
import ApprovalPanel, { type ApprovalRequest } from '@/components/ApprovalPanel';
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer';
import ProductionDetailDrawer from '@/components/ProductionDetailDrawer';
import PurchaseOrderDetailDrawer from '@/components/PurchaseOrderDetailDrawer';

interface ApprovalRule {
  id: string;
  documentType: string;
  minAmount: number | string;
  requiredRole: string;
  isActive: boolean;
}

type Tab = 'requests' | 'rules';

const TAB_PARAM = 'tab';

/** Document types a rule can target (API values); labels live in `approvals:ruleDocTypes.*`. */
const DOC_TYPES = ['PurchaseInvoice', 'ProductionRun', 'PurchaseOrder', 'PaymentRequest', 'SalesInvoice', 'Payment', 'JournalEntry'] as const;
type RuleDocType = (typeof DOC_TYPES)[number];
const isRuleDocType = (value: string): value is RuleDocType => (DOC_TYPES as readonly string[]).includes(value);

const ROLES = ['Admin', 'Accountant'];

const docTypeLabel = (value: string): string => (isRuleDocType(value) ? i18n.t(`approvals:ruleDocTypes.${value}`) : value);

export default function ApprovalsPage() {
  const { t } = useTranslation('approvals');
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Rules endpoints are gated by the approval.decide capability (server); writes
  // also need edit permission on the approvals module.
  const canViewRules = cap('approval.decide');
  const canManageRules = canViewRules && can('approvals', 'edit');
  const tab: Tab = canViewRules && searchParams.get(TAB_PARAM) === 'rules' ? 'rules' : 'requests';
  const focusRequestId = searchParams.get('request') ?? undefined;

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [deleteRule, setDeleteRule] = useState<ApprovalRule | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [viewRunId, setViewRunId] = useState<string | null>(null);
  const [viewPoId, setViewPoId] = useState<string | null>(null);

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'rules') params.set(TAB_PARAM, 'rules');
      else params.delete(TAB_PARAM);
      return params;
    });
  };

  const clearFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  };

  const rulesQuery = useQuery<ApprovalRule[]>({
    queryKey: ['approval-rules'],
    queryFn: async () => (await api.get('/approvals/rules')).data,
    enabled: tab === 'rules',
  });

  const deleteRuleMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/approvals/rules/${id}`)).data,
    onSuccess: () => {
      toast.success(t('page.toast.ruleDeleted'));
      qc.invalidateQueries({ queryKey: ['approval-rules'] });
    },
  });

  const columns = useMemo<ColumnDef<ApprovalRule>[]>(
    () => [
      {
        id: 'documentType',
        header: t('page.columns.documentType'),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{docTypeLabel(row.original.documentType)}</span>
            {/* Mobile: role stacked here because its column is hidden. */}
            <span className="text-xs text-muted-foreground sm:hidden">{t('page.columns.byRole', { role: row.original.requiredRole })}</span>
          </div>
        ),
      },
      {
        id: 'minAmount',
        header: () => (
          <>
            {t('page.columns.minAmount')} <span className="normal-case">{t('page.columns.minAmountUnit')}</span>
          </>
        ),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{formatRupiah(row.original.minAmount, { symbol: false })}</span>
            <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'requiredRole',
        header: t('page.columns.approverRole'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <Badge variant="neutral">{row.original.requiredRole}</Badge>,
      },
      {
        id: 'status',
        header: t('page.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('page.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('page.rowActionsLabel', { type: docTypeLabel(row.original.documentType) })}
            actions={[
              {
                label: t('page.deleteRule'),
                icon: Trash2,
                tone: 'danger',
                hidden: !canManageRules,
                onSelect: () => setDeleteRule(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [canManageRules, t],
  );

  return (
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          tab === 'rules' && canManageRules ? (
            <Button onClick={() => setShowRuleForm(true)}>
              <Plus aria-hidden />
              {t('page.addRule')}
            </Button>
          ) : undefined
        }
      >
        {canViewRules && (
          <TabsList variant="underline" aria-label={t('page.tabsLabel')}>
            <TabsTrigger value="requests">{t('page.tabs.requests')}</TabsTrigger>
            <TabsTrigger value="rules">{t('page.tabs.rules')}</TabsTrigger>
          </TabsList>
        )}
      </PageHeader>

      <TabsContent value="requests" className="mt-1">
        <ApprovalPanel
          focusRequestId={focusRequestId}
          onFocusHandled={clearFocus}
          onViewDocument={(req: ApprovalRequest) => {
            if (!req.documentId) return;
            if (req.documentType === 'PurchaseInvoice' || req.documentType === 'PurchaseInvoiceRevisePrice') setViewInvoiceId(req.documentId);
            else if (req.documentType === 'ProductionRun' || req.documentType === 'ProductionRunEdit') setViewRunId(req.documentId);
            else if (req.documentType === 'PurchaseOrder') setViewPoId(req.documentId);
          }}
        />
      </TabsContent>

      {canViewRules && (
        <TabsContent value="rules" className="mt-1">
          <DataTable
            label={t('page.tableLabel')}
            itemLabel={t('page.itemLabel')}
            columns={columns}
            data={rulesQuery.data}
            getRowId={(row) => row.id}
            loading={rulesQuery.isLoading}
            error={rulesQuery.error}
            onRetry={() => rulesQuery.refetch()}
            stickyHeader={false}
            empty={{
              title: t('page.emptyTitle'),
              description: t('page.emptyDescription'),
              action: canManageRules ? (
                <Button size="sm" onClick={() => setShowRuleForm(true)}>
                  <Plus aria-hidden />
                  {t('page.emptyAction')}
                </Button>
              ) : undefined,
            }}
          />
        </TabsContent>
      )}

      <RuleFormDialog open={showRuleForm} onClose={() => setShowRuleForm(false)} />

      <ConfirmDialog
        open={deleteRule !== null}
        onOpenChange={(open) => !open && setDeleteRule(null)}
        tone="danger"
        title={t('page.deleteDialog.title')}
        description={t('page.deleteDialog.description')}
        confirmLabel={t('page.deleteDialog.confirm')}
        onConfirm={() => {
          if (deleteRule) deleteRuleMut.mutate(deleteRule.id);
          setDeleteRule(null);
        }}
      />

      {/* Final document drawers (from "Lihat Dokumen") */}
      <InvoiceDetailDrawer type="purchase" invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
      <ProductionDetailDrawer runId={viewRunId} onClose={() => setViewRunId(null)} />
      <PurchaseOrderDetailDrawer poId={viewPoId} onClose={() => setViewPoId(null)} />
    </Tabs>
  );
}

interface RuleFormDialogProps {
  open: boolean;
  onClose: () => void;
}

function RuleFormDialog({ open, onClose }: RuleFormDialogProps) {
  const { t } = useTranslation('approvals');
  const qc = useQueryClient();
  const [documentType, setDocumentType] = useState<string>(DOC_TYPES[0]);
  const [minAmount, setMinAmount] = useState('');
  const [requiredRole, setRequiredRole] = useState(ROLES[0]);
  const [touched, setTouched] = useState(false);
  // Custom roles (e.g. Direktur) are listed when the user may read /roles (rbac.manage).
  const rolesQuery = useQuery({
    queryKey: ['roles', 'rule-options'],
    queryFn: async () => ((await api.get('/roles')).data as Array<{ key: string; isActive?: boolean }>).filter((r) => r.isActive !== false).map((r) => r.key),
    enabled: open && cap('rbac.manage'),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const roleOptions = rolesQuery.data?.length ? rolesQuery.data : ROLES;

  const amountError =
    touched && (minAmount.trim() === '' || Number(minAmount) < 0) ? t('page.form.minAmountError') : undefined;

  const reset = () => {
    setDocumentType(DOC_TYPES[0]);
    setMinAmount('');
    setRequiredRole(ROLES[0]);
    setTouched(false);
  };

  const createRuleMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.post('/approvals/rules', data)).data,
    onSuccess: () => {
      toast.success(t('page.toast.ruleCreated'));
      qc.invalidateQueries({ queryKey: ['approval-rules'] });
      reset();
      onClose();
    },
    onError: () => toast.error(t('page.toast.ruleCreateFailed')),
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);
    if (minAmount.trim() === '' || Number(minAmount) < 0) return;
    createRuleMut.mutate({ documentType, minAmount: Number(minAmount), requiredRole });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !createRuleMut.isPending) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('page.form.title')}</DialogTitle>
            <DialogDescription>
              {t('page.form.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label={t('page.form.documentType')} required>
              {(control) => (
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {t(`ruleDocTypes.${d}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label={t('page.form.minAmount')} required error={amountError}>
              <NumberInput
                min={0}
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t('page.form.minAmountPlaceholder')}
              />
            </Field>
            <Field label={t('page.form.requiredRole')} required>
              {(control) => (
                <Select value={requiredRole} onValueChange={setRequiredRole}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={createRuleMut.isPending}
            >
              {t('actions.cancel')}
            </Button>
            <Button type="submit" loading={createRuleMut.isPending}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
