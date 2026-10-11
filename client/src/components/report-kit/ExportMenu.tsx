import { useState, type ReactElement } from 'react';
import { Download, FileDown, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export interface ExportPdf {
  fileName: string;
  /** Builds the @react-pdf document lazily, only when the button is pressed. */
  render: () => ReactElement;
}

export interface ExportMenuProps {
  /** Runs the Excel export (e.g. () => exportToExcel(rows, name)). */
  onExcel?: () => void | Promise<void>;
  pdf?: ExportPdf;
  /** Show a "Cetak" button (window.print). Default true. */
  print?: boolean;
  disabled?: boolean;
}

const COMPACT = 'max-sm:h-11 max-sm:min-w-11 max-sm:px-0';

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Excel / PDF / Cetak buttons with a busy state and an error toast. Icon-only below sm. */
export function ExportMenu({ onExcel, pdf, print = true, disabled }: ExportMenuProps) {
  const { t } = useTranslation('reports');
  const [busy, setBusy] = useState<'excel' | 'pdf' | null>(null);

  const run = async (kind: 'excel' | 'pdf', task: () => void | Promise<void>, errorText: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      console.error(`Report ${kind} export failed:`, error);
      toast.error(errorText);
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = () =>
    run(
      'pdf',
      async () => {
        if (!pdf) return;
        const { pdf: renderPdf } = await import('@react-pdf/renderer');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = await renderPdf(pdf.render() as ReactElement<any>).toBlob();
        downloadBlob(blob, pdf.fileName);
      },
      t('kit.export.pdfFailed'),
    );

  return (
    <>
      {print && (
        <Button variant="outline" className={COMPACT} onClick={() => window.print()} disabled={disabled}>
          <Printer aria-hidden />
          <span className="max-sm:sr-only">{t('kit.export.print')}</span>
        </Button>
      )}
      {pdf && (
        <Button variant="outline" className={COMPACT} onClick={handlePdf} loading={busy === 'pdf'} disabled={disabled || busy === 'excel'}>
          {busy !== 'pdf' && <FileDown aria-hidden />}
          <span className="max-sm:sr-only">{t('kit.export.downloadPdf')}</span>
        </Button>
      )}
      {onExcel && (
        <Button
          className={COMPACT}
          onClick={() => run('excel', onExcel, t('kit.export.excelFailed'))}
          loading={busy === 'excel'}
          disabled={disabled || busy === 'pdf'}
        >
          {busy !== 'excel' && <Download aria-hidden />}
          <span className="max-sm:sr-only">{t('kit.export.excel')}</span>
        </Button>
      )}
    </>
  );
}
