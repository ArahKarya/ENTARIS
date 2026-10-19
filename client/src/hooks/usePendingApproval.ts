import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export type EditApprovalType = 'ProductionRunEdit' | 'PurchaseInvoiceRevisePrice';

/**
 * Cheap lookup (one indexed query): is there a Pending approval request that
 * would mutate this document? Used for the "Menunggu persetujuan" badge and to
 * disable edit/revise actions. The server still enforces this (409).
 */
export function usePendingApproval(documentType: EditApprovalType, documentId: string | null | undefined) {
  const { data } = useQuery<{ pending: { id: string; createdAt: string } | null }>({
    queryKey: ['approval-pending', documentType, documentId],
    queryFn: async () => (await api.get('/approvals/pending', { params: { documentType, documentId } })).data,
    enabled: !!documentId,
    staleTime: 15 * 1000,
  });
  return data?.pending ?? null;
}
