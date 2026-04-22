import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Save, Loader2, Upload, X, ImageIcon, Plus, Trash2 } from 'lucide-react';

interface InvoiceFormatSettings {
  sales?: {
    bankAccounts?: string;
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
  purchase?: {
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
}

export const CompanySettingsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    defaultCurrency: 'IDR',
    logoUrl: null as string | null,
  });
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceFormatSettings>({
    sales: { bankAccounts: '', footerNote: '', showSignature: true, signatureLabels: ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'] },
    purchase: { footerNote: '', showSignature: true, signatureLabels: ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'] },
  });

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      try { const res = await api.get('/settings/company'); return res.data; } catch { return null; }
    },
    staleTime: 60000
  });

  React.useEffect(() => {
    if (settings && !isDirty) {
      setFormData((prev) => ({
        ...prev,
        companyName: settings.companyName || settings.name || prev.companyName,
        address: settings.address || prev.address,
        phone: settings.phone || '',
        email: settings.email || '',
        taxId: settings.taxId || '',
        defaultCurrency: settings.defaultCurrency || settings.currency || 'IDR',
        logoUrl: settings.logoUrl || null,
      }));
      if (settings.invoiceSettings) {
        const s = settings.invoiceSettings as InvoiceFormatSettings;
        setInvoiceSettings({
          sales: {
            bankAccounts: s.sales?.bankAccounts || '',
            footerNote: s.sales?.footerNote || '',
            showSignature: s.sales?.showSignature !== false,
            signatureLabels: s.sales?.signatureLabels?.length ? s.sales.signatureLabels : ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'],
          },
          purchase: {
            footerNote: s.purchase?.footerNote || '',
            showSignature: s.purchase?.showSignature !== false,
            signatureLabels: s.purchase?.signatureLabels?.length ? s.purchase.signatureLabels : ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'],
          },
        });
      }
    }
  }, [settings, isDirty]);

  const handleChange = (key: string, value: string | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const updateInvoiceSetting = (
    section: 'sales' | 'purchase',
    key: string,
    value: string | boolean | string[]
  ) => {
    setInvoiceSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => api.put('/settings/company', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      queryClient.invalidateQueries({ queryKey: ['company-settings-pdf'] });
      setIsDirty(false);
      toast.success('Pengaturan berhasil disimpan.');
    },
    onError: () => toast.error('Gagal menyimpan pengaturan.')
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      handleChange('logoUrl', ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    handleChange('logoUrl', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fields = [
    { key: 'companyName', label: 'Nama Perusahaan', placeholder: 'Nama Perusahaan Anda', type: 'text' },
    { key: 'address', label: 'Alamat', placeholder: 'Alamat perusahaan', type: 'text' },
    { key: 'phone', label: 'Nomor Telepon', placeholder: '+62 xxx', type: 'text' },
    { key: 'email', label: 'Email', placeholder: 'finance@company.com', type: 'email' },
    { key: 'taxId', label: 'NPWP', placeholder: '00.000.000.0-000.000', type: 'text' },
    { key: 'defaultCurrency', label: 'Mata Uang', placeholder: 'IDR', type: 'text' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Profil Perusahaan</h2>
        <p className="text-sm text-gray-500 mt-0.5">Informasi muncul di laporan keuangan dan tampilan aplikasi.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
        {/* Logo Upload Section */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-3">Logo Perusahaan</label>
          <div className="flex items-start gap-4">
            <div className="w-28 h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo preview" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <ImageIcon size={20} />
                  <span className="text-xs">Belum ada</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label htmlFor="logo-upload" className="btn-secondary cursor-pointer text-xs py-1.5 px-3">
                <Upload size={13} />
                {formData.logoUrl ? 'Ganti Logo' : 'Upload Logo'}
              </label>

              {formData.logoUrl && (
                <button type="button" onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
                  <X size={12} /> Hapus Logo
                </button>
              )}

              <p className="text-xs text-gray-400 mt-1">
                PNG, JPG, SVG · Maks. 2MB<br />
                Disarankan: background transparan
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Company Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`field-${f.key}`} className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <input
                id={`field-${f.key}`}
                type={f.type}
                value={(formData as any)[f.key]}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={() => saveMutation.mutate({ ...formData, invoiceSettings })}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan Pengaturan
          </button>
        </div>
      </div>

      {/* ── Invoice Format Settings ── */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-900">Format Faktur</h2>
        <p className="text-sm text-gray-500 mt-0.5">Konfigurasi tampilan faktur penjualan dan pembelian (PDF).</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
        {/* Sales Invoice Settings */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Faktur Penjualan</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Info Rekening Bank
              </label>
              <textarea
                value={invoiceSettings.sales?.bankAccounts || ''}
                onChange={(e) => updateInvoiceSetting('sales', 'bankAccounts', e.target.value)}
                placeholder="BRI: 0123-4567-8901 a.n. Nama Perusahaan Anda&#10;Mandiri: 1234-5678-9012 a.n. Nama Perusahaan Anda"
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Ditampilkan di faktur penjualan untuk membantu pelanggan melakukan pembayaran.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catatan Kaki</label>
              <input
                type="text"
                value={invoiceSettings.sales?.footerNote || ''}
                onChange={(e) => updateInvoiceSetting('sales', 'footerNote', e.target.value)}
                placeholder="Terima kasih atas kepercayaan Anda."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sales-sig"
                checked={invoiceSettings.sales?.showSignature !== false}
                onChange={(e) => updateInvoiceSetting('sales', 'showSignature', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="sales-sig" className="text-sm text-gray-700">Tampilkan area tanda tangan</label>
            </div>
            {invoiceSettings.sales?.showSignature !== false && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Label Tanda Tangan</label>
                <div className="space-y-2">
                  {(invoiceSettings.sales?.signatureLabels || []).map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => {
                          const labels = [...(invoiceSettings.sales?.signatureLabels || [])];
                          labels[i] = e.target.value;
                          updateInvoiceSetting('sales', 'signatureLabels', labels);
                        }}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                      />
                      {(invoiceSettings.sales?.signatureLabels || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const labels = (invoiceSettings.sales?.signatureLabels || []).filter((_, j) => j !== i);
                            updateInvoiceSetting('sales', 'signatureLabels', labels);
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(invoiceSettings.sales?.signatureLabels || []).length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const labels = [...(invoiceSettings.sales?.signatureLabels || []), ''];
                        updateInvoiceSetting('sales', 'signatureLabels', labels);
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={12} /> Tambah kolom tanda tangan
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* Purchase Invoice Settings */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Faktur Pembelian</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Catatan Kaki</label>
              <input
                type="text"
                value={invoiceSettings.purchase?.footerNote || ''}
                onChange={(e) => updateInvoiceSetting('purchase', 'footerNote', e.target.value)}
                placeholder="Barang yang sudah dibeli tidak dapat dikembalikan."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="purchase-sig"
                checked={invoiceSettings.purchase?.showSignature !== false}
                onChange={(e) => updateInvoiceSetting('purchase', 'showSignature', e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="purchase-sig" className="text-sm text-gray-700">Tampilkan area tanda tangan</label>
            </div>
            {invoiceSettings.purchase?.showSignature !== false && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Label Tanda Tangan</label>
                <div className="space-y-2">
                  {(invoiceSettings.purchase?.signatureLabels || []).map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => {
                          const labels = [...(invoiceSettings.purchase?.signatureLabels || [])];
                          labels[i] = e.target.value;
                          updateInvoiceSetting('purchase', 'signatureLabels', labels);
                        }}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                      />
                      {(invoiceSettings.purchase?.signatureLabels || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const labels = (invoiceSettings.purchase?.signatureLabels || []).filter((_, j) => j !== i);
                            updateInvoiceSetting('purchase', 'signatureLabels', labels);
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(invoiceSettings.purchase?.signatureLabels || []).length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const labels = [...(invoiceSettings.purchase?.signatureLabels || []), ''];
                        updateInvoiceSetting('purchase', 'signatureLabels', labels);
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Plus size={12} /> Tambah kolom tanda tangan
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={() => saveMutation.mutate({ ...formData, invoiceSettings })}
            disabled={saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};
