import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface AgingBucket {
  label: string;
  amount: number;
}

interface AgingData {
  receivable: AgingBucket[];
  payable: AgingBucket[];
  totalReceivable: number;
  totalPayable: number;
}

const BUCKET_BG = ['bg-success', 'bg-info', 'bg-warning', 'bg-danger', 'bg-foreground/70'];

function Bar({ buckets, total, label }: { buckets: AgingBucket[]; total: number; label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${buckets.map((b) => `${b.label} ${formatRupiah(b.amount)}`).join(', ')}`}
      className="flex h-3 overflow-hidden rounded-sm bg-muted"
    >
      {total > 0 &&
        buckets.map((b, i) => {
          const pct = (b.amount / total) * 100;
          return pct > 0 ? <div key={b.label} className={BUCKET_BG[i] ?? 'bg-muted-foreground'} style={{ width: `${pct}%` }} /> : null;
        })}
    </div>
  );
}

export default function AgingSummary() {
  const { data, isLoading, isError, refetch } = useQuery<AgingData>({
    queryKey: ['aging-summary'],
    queryFn: async () => (await api.get('/dashboard/aging-summary')).data,
  });

  return (
    <WidgetCard
      title="Umur Piutang & Utang"
      icon={Clock}
      href="/reports/aging-ar"
      hrefLabel="Detail"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      minHeight={230}
    >
      {data && (
        <div className="space-y-4">
          {([
            ['Piutang (AR)', data.receivable, data.totalReceivable],
            ['Hutang (AP)', data.payable, data.totalPayable],
          ] as const).map(([label, buckets, total]) => (
            <div key={label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <span className="num text-xs font-semibold text-foreground">{formatRupiah(total)}</span>
              </div>
              <Bar buckets={buckets} total={total} label={label} />
            </div>
          ))}
          <ScrollRegion label="Rincian umur piutang dan utang" className="overflow-x-auto border border-border">
            <table className="w-full min-w-[320px] border-collapse text-xs">
              <caption className="sr-only">Umur piutang dan utang per kelompok hari</caption>
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-1.5 text-left font-medium">Umur</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Piutang</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Hutang</th>
                </tr>
              </thead>
              <tbody>
                {data.receivable.map((b, i) => (
                  <tr key={b.label} className="border-t border-border">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-foreground">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className={cn('size-2 rounded-sm', BUCKET_BG[i])} />
                        {b.label}
                      </span>
                    </th>
                    <td className="num px-3 py-1.5 text-right">{formatRupiah(b.amount, { compact: true })}</td>
                    <td className="num px-3 py-1.5 text-right">{formatRupiah(data.payable[i]?.amount ?? 0, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </div>
      )}
    </WidgetCard>
  );
}
