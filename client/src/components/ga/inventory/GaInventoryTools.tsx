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
  const [exporting, setExporting] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setExporting(type);
    try {
      await downloadCsv(type);
      toast.success('File CSV diunduh.');
    } catch {
      toast.error('Gagal mengunduh file.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel title="Stok Opname Cepat" description="Samakan stok sistem dengan hitungan fisik">
        <p className="text-sm text-muted-foreground">
          Isi stok hasil hitung per item dan lokasi. Selisih terhadap stok sistem otomatis tercatat sebagai mutasi{' '}
          <strong className="font-medium text-foreground">Penyesuaian</strong>, jadi riwayat tetap utuh.
        </p>
        {canEdit ? (
          <div className="mt-4 space-y-2">
            <Button onClick={onOpname} disabled={!hasLocations}>
              <ClipboardCheck aria-hidden />
              Mulai Opname
            </Button>
            {!hasLocations && (
              <p className="text-xs text-danger-text">Buat lokasi gudang dulu di Data Induk Aset → Lokasi.</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Butuh izin ubah Inventaris Kantor untuk melakukan opname.</p>
        )}
      </Panel>

      <Panel title="Ekspor CSV" description="Pemisah titik koma, siap dibuka di Excel">
        <p className="text-sm text-muted-foreground">
          Unduh daftar item lengkap dengan stok dan status, atau riwayat mutasi (maks. 5.000 baris terbaru).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('items')}
            loading={exporting === 'items'}
            disabled={exporting !== null}
          >
            <Download aria-hidden />
            Daftar Item
          </Button>
          <Button
            variant="outline"
            onClick={() => handleExport('movements')}
            loading={exporting === 'movements'}
            disabled={exporting !== null}
          >
            <Download aria-hidden />
            Riwayat Mutasi
          </Button>
        </div>
      </Panel>

      <Panel title="Cara Stok Dihitung" className="md:col-span-2" action={<Info className="size-4 text-muted-foreground" aria-hidden />}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Total stok</strong> = jumlah stok semua lokasi, murni turunan
            dari mutasi. Tidak bisa diketik manual di form item.
          </li>
          <li>
            <strong className="font-medium text-foreground">Stok minimum</strong> hanya ambang peringatan — mengisinya tidak
            menambah stok.
          </li>
          <li>
            Stok pertama kali: tab <strong className="font-medium text-foreground">Pergerakan</strong> → Catat Pergerakan →
            tipe Masuk.
          </li>
          <li>
            Inventaris kantor <strong className="font-medium text-foreground">tidak</strong> membuat jurnal/GL — terpisah
            dari persediaan akuntansi.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
