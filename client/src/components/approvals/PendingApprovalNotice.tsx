import { Clock } from 'lucide-react';
import { StatusBadge } from '@/components/shared';

/** Badge for headers. */
export function PendingApprovalBadge() {
  return <StatusBadge status="pending" label="Menunggu persetujuan" />;
}

/** Inline notice explaining why edit/revise is disabled. */
export function PendingApprovalNotice({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">Menunggu persetujuan.</span> {what} belum diterapkan dan tidak bisa diajukan lagi sampai manajer memutuskan.
      </span>
    </div>
  );
}
