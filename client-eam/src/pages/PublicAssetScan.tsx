import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle, Package, MapPin, Tag, CheckCircle2 } from 'lucide-react';

// Halaman PUBLIK (tanpa auth) — target scan QR aset GA.
// Mengambil info aset non-sensitif via /api/ga/public/:qrCode.
interface PublicAsset {
  code: string;
  name: string;
  category: string | null;
  categoryCode: string | null;
  branch: string | null;
  status: string;
  condition: string;
  location: string | null;
  photos: { id: string; url: string; caption: string | null }[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif', IN_REPAIR: 'Perbaikan', RETIRED: 'Dipensiunkan', LOST: 'Hilang',
};
const COND_LABEL: Record<string, string> = {
  GOOD: 'Baik', FAIR: 'Cukup', POOR: 'Kurang', BROKEN: 'Rusak',
};

export default function PublicAssetScan() {
  const { qrCode } = useParams<{ qrCode: string }>();
  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/ga/public/${encodeURIComponent(qrCode ?? '')}`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (alive) setAsset(data);
      } catch {
        if (alive) setError('Aset tidak ditemukan atau QR tidak valid.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [qrCode]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm">Memuat info aset…</span>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-100 p-6 text-center">
            <AlertCircle className="mx-auto text-red-400 mb-3" size={32} />
            <p className="text-sm text-gray-700">{error}</p>
          </div>
        ) : asset ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-teal-600 to-teal-700 px-5 py-5 text-white">
              <div className="flex items-center gap-2 text-teal-100 text-xs font-medium mb-1">
                <Package size={14} /> Aset Tetap
              </div>
              <h1 className="text-lg font-bold leading-tight">{asset.name}</h1>
              <p className="text-teal-100 text-sm font-mono mt-1">{asset.code}</p>
            </div>

            <div className="p-5 space-y-3 text-sm">
              <Row icon={<Tag size={15} />} label="Kategori" value={asset.category ?? '—'} />
              <Row icon={<MapPin size={15} />} label="Cabang" value={asset.branch ?? '—'} />
              {asset.location && <Row icon={<MapPin size={15} />} label="Lokasi" value={asset.location} />}
              <div className="flex items-center gap-2 pt-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${asset.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[asset.status] ?? asset.status}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                  Kondisi: {COND_LABEL[asset.condition] ?? asset.condition}
                </span>
              </div>

              {asset.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {asset.photos.map((p) => (
                    <img key={p.id} src={p.url} alt={p.caption ?? asset.code}
                      className="rounded-lg border border-gray-100 object-cover w-full h-28" />
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
              <CheckCircle2 size={13} className="text-green-500" /> Data resmi sistem aset perusahaan
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-gray-500">{icon}{label}</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}
