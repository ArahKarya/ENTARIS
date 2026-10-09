import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import PDFDownloadButton from '../PDFDownloadButton';
import ReportTableSkeleton from './ReportTableSkeleton';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';

// Date Filters

const dateInputClass =
  'text-sm border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring';

type DateFilter =
  | {
      mode: 'range';
      startDate: string;
      endDate: string;
      onStartDateChange: (d: string) => void;
      onEndDateChange: (d: string) => void;
    }
  | {
      mode: 'single';
      date: string;
      onDateChange: (d: string) => void;
      label?: string;
    }
  | { mode: 'none' };

function formatPeriodLabel(filter?: DateFilter): string {
  if (!filter) return '';
  if (filter.mode === 'range') {
    return `Periode: ${filter.startDate} s/d ${filter.endDate}`;
  }
  if (filter.mode === 'single') {
    return `Per tanggal: ${filter.date}`;
  }
  return `Per tanggal: ${new Date().toISOString().slice(0, 10)}`;
}

interface ReportLayoutProps {
  title: string;
  subtitle: string;
  backTo?: string;
  dateFilter?: DateFilter;

  // Export actions
  onPrint?: () => void;
  pdfDocument?: React.ReactElement;
  pdfFileName?: string;
  onExportExcel?: () => void;

  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;

  // Optional alert (e.g. unbalanced warning)
  alert?: React.ReactNode;

  // Optional extra controls rendered between date filter and content
  extraControls?: React.ReactNode;

  children: React.ReactNode;
}

// Print Header (only visible during print)

const PrintHeader: React.FC<{ title: string; periodLabel: string }> = ({ title, periodLabel }) => {
  const company = useCompanySettings();
  const companyName = company?.companyName || 'Perusahaan';
  const address = company?.address;
  const taxId = company?.taxId;
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="print-only hidden mb-6">
      <div className="flex justify-between items-start border-b-2 border-foreground pb-3 mb-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">{companyName}</h2>
          {address && <p className="text-xs text-foreground-secondary">{address}</p>}
          {taxId && <p className="text-xs text-foreground-secondary">NPWP: {taxId}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-xl font-bold text-foreground">{title.toUpperCase()}</h1>
          <p className="text-sm text-foreground-secondary mt-0.5">{periodLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Dicetak: {printDate}</p>
        </div>
      </div>
    </div>
  );
};

const ReportLayout: React.FC<ReportLayoutProps> = ({
  title,
  subtitle,
  backTo = '/reports',
  dateFilter,
  onPrint,
  pdfDocument,
  pdfFileName,
  onExportExcel,
  isLoading,
  isError,
  onRetry,
  alert,
  extraControls,
  children,
}) => {
  const periodLabel = formatPeriodLabel(dateFilter);

  return (
    <div className="space-y-5 pb-8">
      {/* Print-only header — hidden on screen, visible when printing */}
      <PrintHeader title={title} periodLabel={periodLabel} />

      {/* Back link — hidden when printing */}
      <Link
        to={backTo}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-2 no-print"
        data-no-print
      >
        <ArrowLeft size={14} /> Kembali ke Laporan
      </Link>

      {/* Header — screen only */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print" data-no-print>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onPrint || (() => window.print())}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Printer size={14} /> Cetak
          </button>
          {pdfDocument && (
            <PDFDownloadButton
              variant="button"
              fileName={pdfFileName || 'report.pdf'}
              label="Export PDF"
              document={pdfDocument}
            />
          )}
          {onExportExcel && (
            <button onClick={onExportExcel} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Download size={14} /> Export Excel
            </button>
          )}
        </div>
      </div>

      {/* Date Filter — hidden when printing */}
      {dateFilter && dateFilter.mode === 'range' && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 no-print" data-no-print>
          <span className="text-xs text-muted-foreground font-medium">Periode:</span>
          <input
            type="date"
            value={dateFilter.startDate}
            aria-label="Tanggal mulai"
            onChange={(e) => dateFilter.onStartDateChange(e.target.value)}
            className={dateInputClass}
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            value={dateFilter.endDate}
            aria-label="Tanggal akhir"
            onChange={(e) => dateFilter.onEndDateChange(e.target.value)}
            className={dateInputClass}
          />
        </div>
      )}
      {dateFilter && dateFilter.mode === 'single' && (
        <div className="flex items-center gap-3 no-print" data-no-print>
          <span className="text-xs text-muted-foreground font-medium">{dateFilter.label || 'Per tanggal:'}</span>
          <input
            type="date"
            value={dateFilter.date}
            aria-label={dateFilter.label || 'Per tanggal'}
            onChange={(e) => dateFilter.onDateChange(e.target.value)}
            className={dateInputClass}
          />
        </div>
      )}

      {/* Alert */}
      {alert}

      {/* Extra controls — hidden during print (summary cards, search, etc.) */}
      {extraControls && (
        <div className="no-print" data-no-print>
          {extraControls}
        </div>
      )}

      {/* Content — always visible */}
      {isError ? (
        <div className="bg-card border border-danger/30 rounded-xl p-8 text-center">
          <p className="text-sm text-danger-text mb-3">Gagal memuat laporan.</p>
          {onRetry && (
            <button onClick={onRetry} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Coba Lagi
            </button>
          )}
        </div>
      ) : isLoading ? (
        <ReportTableSkeleton />
      ) : (
        children
      )}
    </div>
  );
};

export default ReportLayout;
