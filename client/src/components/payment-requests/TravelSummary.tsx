import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { tripDays, type PaymentRequestDetail } from './payment-request';

/** Perjalanan dinas summary on the detail page (only for requests that have travel data). */
export function TravelSummary({ pr }: { pr: PaymentRequestDetail }) {
  if (pr.type.kind !== 'TRAVEL' && !pr.travelDestination) return null;
  const days = tripDays(pr.travelStartDate, pr.travelEndDate);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perjalanan dinas</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Kota / tujuan</dt>
            <dd className="font-medium text-foreground">{pr.travelDestination ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Durasi</dt>
            <dd className="font-medium text-foreground">{days ? `${days} hari (${Math.max(days - 1, 0)} malam)` : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Berangkat</dt>
            <dd className="text-foreground">{pr.travelStartDate ? formatDate(pr.travelStartDate) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kembali</dt>
            <dd className="text-foreground">{pr.travelEndDate ? formatDate(pr.travelEndDate) : '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Keperluan</dt>
            <dd className="text-foreground">{pr.purpose}</dd>
          </div>
          {pr.travelParticipants && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Peserta</dt>
              <dd className="whitespace-pre-line text-foreground">{pr.travelParticipants}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
