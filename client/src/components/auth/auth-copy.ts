/**
 * Copy for the auth screens (plan §3.2, final copy). EAM is now a module inside
 * the main app, so ERP is the only product; the type is kept so call sites stay
 * explicit.
 */
export type AuthProduct = 'ERP';

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
    panelHeadline: 'Penjualan, pembelian, stok, dan produksi dalam satu buku besar.',
    panelPoints: [
      'Setiap transaksi membentuk jurnal double-entry tanpa input ulang.',
      'Setiap perubahan tercatat di jejak audit, dengan akses sesuai peran.',
    ],
  },
};

/** Legal entity shown in the auth footer. */
export const VENDOR_NAME = 'PT Arah Karya Sinergi';
