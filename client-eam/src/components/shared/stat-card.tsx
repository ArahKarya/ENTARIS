import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
};

export function StatCard({ title, value, subtitle, icon: Icon, trend }: StatCardProps) {
  return (
    <Card className="rounded-sm border border-border shadow-xs hover:shadow-sm transition-shadow duration-150">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
              {title}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className="font-tabular text-2xl font-semibold leading-none tracking-tight">
                {value}
              </p>
              {trend && (
                <span
                  className={cn(
                    'font-tabular text-xs font-semibold',
                    trend.positive ? 'text-[var(--success)]' : 'text-destructive',
                  )}
                >
                  {trend.value}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1.5 text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/60">
            <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
