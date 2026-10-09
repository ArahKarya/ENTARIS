import { FlaskConical } from 'lucide-react';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

/** Shown on every page while generated test data is mixed into lists and reports. */
export function DummyDataBanner() {
  const settings = useCompanySettings();
  if (!settings?.hasDummyData) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        Data uji coba sedang aktif. Mitra bertanda [Dummy] beserta transaksinya ikut terhitung di daftar, dasbor, dan laporan.
        Admin dapat menghapusnya di Pengaturan, tab Cadangan &amp; Pemulihan.
      </p>
    </div>
  );
}
