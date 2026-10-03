import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Loader2, CheckCircle2, AlertCircle, Send, ArrowLeft } from 'lucide-react';

interface Branding {
  companyName: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  phone?: string | null;
  email?: string | null;
}

const CHANNEL_FROM_SRC: Record<string, string> = {
  wa: 'WhatsApp',
  whatsapp: 'WhatsApp',
  ig: 'Referral',
  email: 'Email',
  ref: 'Referral',
  walk: 'WalkIn',
  // QR variants — all map to "Walk-in" since QR is typically scanned from
  // a printed surface or display (kartu nama, brosur, banner).
  'qr-cetak': 'WalkIn',
  'qr-toko': 'WalkIn',
  'qr-kartu-nama': 'WalkIn',
};

export default function PublicInquiry() {
  const [searchParams] = useSearchParams();
  const srcParam = searchParams.get('src')?.toLowerCase() ?? '';
  const channel = CHANNEL_FROM_SRC[srcParam] ?? 'Lainnya';

  const [branding, setBranding] = useState<Branding | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ inquiryNumber: string; message: string } | null>(null);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  useEffect(() => {
    document.title = 'Tanya Harga / Pemesanan';
    api.get('/public/branding')
      .then((r) => setBranding(r.data))
      .catch(() => setBranding(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Nama minimal 2 karakter.'); return; }
    if (phone.trim().length < 8) { setError('Nomor telepon/WA minimal 8 digit.'); return; }
    if (itemsText.trim().length < 10) { setError('Tuliskan permintaan Anda (minimal 10 karakter).'); return; }

    setSubmitting(true);
    try {
      const res = await api.post('/public/inquiry', {
        prospectName: name.trim(),
        prospectPhone: phone.trim(),
        prospectEmail: email.trim() || null,
        itemsText: itemsText.trim(),
        channel,
        website,
      });
      setSuccess({
        inquiryNumber: res.data.inquiryNumber,
        message: res.data.message,
      });
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Gagal mengirim permintaan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const companyName = branding?.companyName || 'Perusahaan Kami';
  const logoSrc = branding?.logoUrl || '/pwa-192x192.png';

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Terima Kasih!</h1>
          <p className="text-sm text-gray-600 mb-4">{success.message}</p>
          <div className="bg-gray-50 rounded-lg p-3 mb-5">
            <p className="text-xs text-gray-500">Nomor Referensi:</p>
            <p className="font-mono text-sm font-semibold text-gray-900">{success.inquiryNumber}</p>
          </div>
          {(branding?.phone || branding?.email) && (
            <p className="text-xs text-gray-500">
              Butuh tindakan cepat? Hubungi kami:
              {branding.phone && <><br />📞 {branding.phone}</>}
              {branding.email && <><br />✉️ {branding.email}</>}
            </p>
          )}
          <button
            onClick={() => { setSuccess(null); setName(''); setPhone(''); setEmail(''); setItemsText(''); }}
            className="mt-5 text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <ArrowLeft size={12} /> Kirim permintaan lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-start sm:items-center justify-center p-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        {/* Branded header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={logoSrc} alt={companyName} className="w-10 h-10 object-contain" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">Tanya Harga / Pemesanan</p>
              <p className="font-bold text-base">{companyName}</p>
            </div>
          </div>
          <p className="text-xs text-blue-100 leading-relaxed">
            Isi form di bawah dengan kebutuhan Anda. Tim sales kami akan menghubungi Anda dalam 1×24 jam dengan penawaran harga &amp; ketersediaan stok.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Honeypot — hidden from real users */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
            <label>Website (jangan diisi)
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-gray-700 mb-1">
              Nama / Nama Perusahaan <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Pak Budi / PT Sukses Makmur"
              maxLength={200}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-semibold text-gray-700 mb-1">
              Telepon / WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xx-xxxx-xxxx"
              maxLength={50}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1">
              Email <span className="text-gray-400 font-normal">(opsional)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@domain.com"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="itemsText" className="block text-xs font-semibold text-gray-700 mb-1">
              Apa yang ingin Anda tanyakan? <span className="text-red-500">*</span>
            </label>
            <textarea
              id="itemsText"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
              rows={5}
              placeholder="Mis: Saya butuh Produk A 25 kg 100 sak dan Produk B 2 ton, mohon info harga & ketersediaan stok untuk delivery pekan depan ke kota kami."
              maxLength={2000}
              required
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">{itemsText.length} / 2000 karakter</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm py-3 rounded-lg transition-colors"
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> Mengirim...</>
            ) : (
              <><Send size={16} /> Kirim Permintaan</>
            )}
          </button>

          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            Dengan mengirim form ini, Anda mengizinkan kami menyimpan data kontak untuk keperluan tindak lanjut penawaran.
          </p>
        </form>
      </div>
    </div>
  );
}
