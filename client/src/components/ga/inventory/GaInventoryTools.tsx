/**
 * Inventaris Kantor → tab "Alat" (?tab=tools): quick stock count (opname),
 * CSV export (GET /ga/inventory/export?type=items|movements) and how stock
 * is calculated.
 */
import { useState } from 'react';
import { ClipboardCheck, Download, Info } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/inventory/dashboard-kit';
import { Trans, useTranslation } from 'react-i18next';

type ExportType = 'items' | 'movements';

interface GaInventoryToolsProps {
  canEdit: boolean;
  hasLocations: boolean;
  onOpname: () => void;
}

async function downloadCsv(type: ExportType) {
  const res = await api.get(`/ga/inventory/export?type=${type}`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ga-inventory-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function GaInventoryTools({ canEdit, hasLocations, onOpname }: GaInventoryToolsProps) {
  const { t } = useTranslation('eam');
  const [exporting, setExporting] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setExporting(type);
    try {
      await downloadCsv(type);
      toast.success(t('gaInventory.tools.downloaded'));
    } catch {
      toast.error(t('gaInventory.tools.downloadFailed'));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel title={t('gaInventory.tools.opnameTitle')} description={t('gaInventory.tools.opnameDescription')}>
        <p className="text-sm text-muted-foreground">
          <Trans t={t} i18nKey="gaInventory.tools.opnameBody" components={{ strong: <strong className="font-medium text-foreground" /> }} />
        </p>
        {canEdit ? (
          <div className="mt-4 space-y-2">
            <Button onClick={onOpname} disabled={!hasLocations}>
              <ClipboardCheck aria-hidden />
              {t('gaInventory.tools.startOpname')}
            </Button>
            {!hasLocations && (
              <p className="text-xs text-danger-text">{t('gaInventory.tools.needLocation')}</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">{t('gaInventory.tools.needPermission')}</p>
        )}
      </Panel>

      <Panel title={t('gaInventory.tools.exportTitle')} description={t('gaInventory.tools.exportDescription')}>
        <p className="text-sm text-muted-foreground">
          {t('gaInventory.tools.exportBody')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('items')}
            loading={exporting === 'items'}
            disabled={exporting !== null}
          >
            <Download aria-hidden />
            {t('gaInventory.tools.exportItems')}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('movements')}
            loading={exporting === 'movements'}
            disabled={exporting !== null}
          >
            <Download aria-hidden />
            {t('gaInventory.tools.exportMovements')}
          </Button>
        </div>
      </Panel>

      <Panel title={t('gaInventory.tools.howTitle')} className="md:col-span-2" action={<Info className="size-4 text-muted-foreground" aria-hidden />}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {(['total', 'minimum', 'first', 'noGl'] as const).map((key) => (
            <li key={key}>
              <Trans t={t} i18nKey={`gaInventory.tools.how.${key}`} components={{ strong: <strong className="font-medium text-foreground" /> }} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
