/** Product-specific copy for the shared auth screens (plan §3.2, final copy). */
export type AuthProduct = 'ERP' | 'EAM';

export interface AuthCopy {
  documentTitle: string;
  heading: string;
  subtitle: string;
  panelHeadline: string;
  panelPoints: readonly string[];
}

export const AUTH_COPY: Record<AuthProduct, AuthCopy> = {
  ERP: {
    documentTitle: 'Masuk · Entaris',
    heading: 'Masuk ke Entaris',
    subtitle: 'Gunakan akun yang diberikan administrator perusahaan Anda.',
    panelHeadline: 'Pembukuan rapi, operasi terukur.',
    panelPoints: [
      'Pembukuan double-entry otomatis',
      'Jejak audit di setiap transaksi',
      'Akses sesuai peran',
    ],
  },
  EAM: {
    documentTitle: 'Masuk · Entaris EAM',
    heading: 'Masuk ke Entaris EAM',
    subtitle: 'Gunakan akun Entaris ERP yang sama.',
    panelHeadline: 'Aset terawat, operasi tanpa jeda.',
    panelPoints: [
      'Work order & jadwal preventif',
      'Kendaraan, gedung & peralatan',
      'Terhubung ke Aset Tetap ERP',
    ],
  },
};

/** Legal entity shown in the auth footer. */
export const VENDOR_NAME = 'PT Arah Karya Sinergi';
