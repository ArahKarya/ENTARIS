import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Circle, ListChecks, X } from 'lucide-react';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  dismissChecklist,
  isChecklistDismissed,
  setupChecklist,
  type FiscalYearLite,
  type OnboardingCompany,
} from './onboarding-state';

/**
 * "Lengkapi penyiapan" card for the dashboard. Admin-only, appears after the
 * onboarding wizard was finished or skipped (`onboardedAt` set) while some setup
 * tasks are still open, and hides for good on this browser once dismissed.
 */
export function SetupChecklistCard() {
  const company = useCompanySettings() as OnboardingCompany | null;
  const [canManage] = useState(() => can('settings', 'edit'));
  const [canSeeUsers] = useState(() => can('users', 'view'));
  const [dismissed, setDismissed] = useState(isChecklistDismissed);
  const active = canManage && !dismissed && !!company?.onboardedAt;

  const { data: fiscalYears } = useQuery<FiscalYearLite[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => (await api.get('/fiscal-years')).data,
    enabled: active,
  });
  const { data: userCount } = useQuery<number>({
    queryKey: ['users', { count: true }],
    queryFn: async () => Number((await api.get('/users', { params: { limit: 1 } })).data?.total ?? 0),
    enabled: active && canSeeUsers,
  });

  if (!active || !company || !fiscalYears || (canSeeUsers && userCount === undefined)) return null;
  // Open tasks first; finished ones sink to the end of the list.
  const items = setupChecklist({ company, fiscalYears, userCount: canSeeUsers ? userCount : undefined }).sort(
    (a, b) => Number(a.done) - Number(b.done),
  );
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;

  const hide = () => {
    dismissChecklist();
    setDismissed(true);
  };

  return (
    <Card role="region" aria-labelledby="setup-checklist-title" className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
          <ListChecks className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="setup-checklist-title" className="font-heading text-base font-semibold text-foreground">
            Lengkapi penyiapan
          </h2>
          <p className="text-sm text-muted-foreground">
            {doneCount} dari {items.length} langkah selesai. Lengkapi agar dokumen dan laporan siap dipakai.
          </p>
          <div
            role="progressbar"
            aria-label="Kemajuan penyiapan"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={doneCount}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={hide} aria-label="Sembunyikan daftar penyiapan" className="-mr-1 -mt-1 text-muted-foreground">
          <X />
        </Button>
      </div>

      <ul className="mt-4 grid grid-cols-1 items-start gap-2 lg:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-border px-3 py-2.5',
              item.done && 'bg-muted/40',
            )}
          >
            {item.done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', item.done ? 'text-muted-foreground' : 'text-foreground')}>
                <span className="sr-only">{item.done ? 'Selesai: ' : 'Belum: '}</span>
                {item.label}
              </p>
              {!item.done && (
                <>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.where}</p>
                </>
              )}
            </div>
            {!item.done && (
              <Link
                to={item.href}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${item.label} di ${item.where}`}
              >
                Buka <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
