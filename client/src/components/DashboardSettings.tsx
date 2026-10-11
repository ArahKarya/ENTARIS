import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { WidgetConfig } from './dashboardWidgets';
export type { WidgetConfig };

interface DashboardSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
}

const DashboardSettings: React.FC<DashboardSettingsProps> = ({ isOpen, onClose, widgets, onToggle }) => {
  const { t } = useTranslation('settings');
  return (
  <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
      <DialogHeader className="border-b border-border p-5">
        <DialogTitle>{t('dashboardSettings.title')}</DialogTitle>
        <DialogDescription>{t('dashboardSettings.description')}</DialogDescription>
      </DialogHeader>

      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {widgets.map((w) => {
          const labelId = `dash-widget-${w.id}`;
          return (
            <li key={w.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <w.icon size={16} className="text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p id={labelId} className="text-sm font-medium text-foreground">{w.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{w.description}</p>
              </div>
              <Switch
                checked={w.enabled}
                onCheckedChange={() => onToggle(w.id)}
                aria-labelledby={labelId}
              />
            </li>
          );
        })}
      </ul>

      <DialogFooter className="border-t border-border p-5">
        <Button onClick={onClose} className="w-full sm:w-auto">{t('dashboardSettings.done')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
};

export default DashboardSettings;
