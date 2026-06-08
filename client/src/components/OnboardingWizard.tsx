import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import {
  Sparkles,
  Building2,
  Calendar,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Loader2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  { icon: Sparkles, label: 'Selamat Datang' },
  { icon: Building2, label: 'Profil Perusahaan' },
  { icon: Calendar, label: 'Tahun Fiskal' },
  { icon: KeyRound, label: 'Ganti Password' },
  { icon: CheckCircle2, label: 'Selesai' },
];

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 2: Company profile
  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    address: '',
    phone: '',
    email: '',
  });

  // Step 4: Password
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  });

  // Fetch fiscal years for step 3
  const { data: fiscalYears, isLoading: fyLoading } = useQuery<any[]>({
    queryKey: ['fiscal-years'],
    queryFn: async () => {
      const r = await api.get('/fiscal-years');
      return r.data;
    },
  });

  // Fetch current company settings
  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      try {
        const r = await api.get('/settings/company');
        return r.data;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (settings) {
      setCompanyForm({
        companyName: settings.companyName || '',
        address: settings.address || '',
        phone: settings.phone || '',
        email: settings.email || '',
      });
    }
  }, [settings]);

  const handleNext = async () => {
    // Validate & save per step
    if (step === 1) {
      // Save company profile
      if (!companyForm.companyName.trim()) {
        toast.error('Nama perusahaan wajib diisi.');
        return;
      }
      setSaving(true);
      try {
        await api.put('/settings/company', companyForm);
        queryClient.invalidateQueries({ queryKey: ['company-settings'] });
        toast.success('Profil perusahaan disimpan.');
      } catch {
        toast.error('Gagal menyimpan profil perusahaan.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (step === 3) {
      // Save password change
      if (passwordForm.currentPassword && passwordForm.newPassword) {
        if (passwordForm.newPassword.length < 6) {
          toast.error('Password baru minimal 6 karakter.');
          return;
        }
        setSaving(true);
        try {
          await api.put('/users/me/password', passwordForm);
          toast.success('Password berhasil diubah.');
        } catch (err: any) {
          toast.error(err.response?.data?.error || 'Gagal mengubah password.');
          setSaving(false);
          return;
        }
        setSaving(false);
      }
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboardingDone', 'true');
    onComplete();
  };

  // Progress width
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      {/* Background subtle pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-xl mx-4">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                    i < step
                      ? 'bg-green-500 text-white'
                      : i === step
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'border-2 text-gray-300'
                  )}
                  style={i > step ? { borderColor: 'var(--color-border)' } : undefined}
                >
                  {i < step ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <s.icon size={14} />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'hidden sm:block w-8 h-0.5 rounded-full transition-colors',
                      i < step ? 'bg-green-500' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border shadow-xl p-8"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
          }}
        >
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
                <Sparkles size={36} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  Selamat Datang!
                </h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  ERP PMD siap digunakan. Mari setup perusahaan Anda dalam beberapa langkah mudah.
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Company Profile */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Building2 size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Profil Perusahaan</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Informasi dasar perusahaan Anda</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Nama Perusahaan *</label>
                  <input
                    type="text"
                    value={companyForm.companyName}
                    onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                    placeholder="PT. Contoh Perusahaan"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Alamat</label>
                  <textarea
                    value={companyForm.address}
                    onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                    placeholder="Jl. Contoh No. 123, Kota"
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none resize-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Telepon</label>
                    <input
                      type="text"
                      value={companyForm.phone}
                      onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                      placeholder="+62 21 xxx"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                    <input
                      type="email"
                      value={companyForm.email}
                      onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                      placeholder="info@perusahaan.com"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Fiscal Year */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Calendar size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Tahun Fiskal</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Periode akuntansi aktif</p>
                </div>
              </div>

              {fyLoading ? (
                <div className="py-8 flex items-center justify-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                  <Loader2 className="animate-spin" size={18} />
                  <span className="text-sm">Memuat data...</span>
                </div>
              ) : fiscalYears && fiscalYears.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Tahun fiskal sudah tersedia:
                  </p>
                  {fiscalYears.map((fy: any) => (
                    <div
                      key={fy.id}
                      className="flex items-center justify-between p-4 rounded-xl border"
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                          Tahun {fy.name}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {format(new Date(fy.startDate), 'dd MMM yyyy', { locale: idLocale })} -{' '}
                          {format(new Date(fy.endDate), 'dd MMM yyyy', { locale: idLocale })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'badge rounded-full',
                          fy.isClosed ? 'badge-gray' : 'badge-green'
                        )}
                      >
                        {fy.isClosed ? 'Closed' : 'Open'}
                      </span>
                    </div>
                  ))}
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Anda dapat mengelola tahun fiskal di menu Pengaturan nanti.
                  </p>
                </div>
              ) : (
                <div
                  className="text-center py-8 rounded-xl border-2 border-dashed"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <Calendar size={32} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Belum ada tahun fiskal. Anda bisa membuatnya di Pengaturan.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Change Password */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-50 dark:bg-yellow-900/30 flex items-center justify-center">
                  <KeyRound size={20} className="text-yellow-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Ganti Password</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Ganti password bawaan untuk keamanan</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Password Saat Ini</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    placeholder="Masukkan password saat ini"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Password Baru</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Kosongkan jika tidak ingin mengubah password sekarang.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 4 && (
            <div className="text-center space-y-6 py-4">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto animate-[bounce_1s_ease-in-out]">
                <CheckCircle2 size={40} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  Selesai!
                </h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Setup awal berhasil. Anda sekarang bisa mulai menggunakan aplikasi.
                </p>
              </div>
              <button
                onClick={handleComplete}
                className="btn-primary mx-auto text-sm px-8 py-3"
              >
                Dashboard <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Navigation buttons */}
          {step < 4 && (
            <div className="flex items-center justify-between mt-8 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                {step > 0 && (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <ChevronLeft size={16} /> Kembali
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {step > 0 && step < 4 && (
                  <button
                    onClick={handleSkip}
                    className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <SkipForward size={13} /> Lewati
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={saving}
                  className="btn-primary text-sm px-6"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}
                  {saving ? 'Menyimpan...' : 'Lanjut'}
                  {!saving && <ChevronRight size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
