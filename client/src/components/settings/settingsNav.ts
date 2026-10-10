import {
  Building2, Calendar, Receipt, Shield, KeyRound, Send, HardDrive, Palette, Info, HandCoins,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { AiraIcon } from '@/components/shell/AiraIcon';

export type SettingsTabId =
  | 'company' | 'fiscal' | 'tax' | 'accounts' | 'payment-request-types' | 'roles'
  | 'notifications' | 'backup' | 'agentic' | 'appearance' | 'about';

export interface SettingsNavItem {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Only shown to users with the rbac.manage capability. */
  rbacOnly?: boolean;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: 'Perusahaan',
    items: [
      { id: 'company', label: 'Profil Perusahaan', icon: Building2, description: 'Identitas perusahaan, logo, dan format faktur PDF.' },
      { id: 'fiscal', label: 'Tahun Buku', icon: Calendar, description: 'Kelola periode akuntansi serta tutup dan buka kembali tahun buku.' },
      { id: 'tax', label: 'Pajak', icon: Receipt, description: 'Tarif PPN, PPh, dan pajak lain yang dipakai di transaksi.' },
      { id: 'accounts', label: 'Akun Sistem', icon: Shield, description: 'Pemetaan akun COA yang dipakai otomatis oleh sistem.' },
      { id: 'payment-request-types', label: 'Jenis Pengajuan', icon: HandCoins, description: 'Jenis Pengajuan Pembayaran: reimbursement, uang muka, perjalanan dinas, dan lainnya.' },
    ],
  },
  {
    label: 'Pengguna & Akses',
    items: [
      { id: 'roles', label: 'Peran & Hak Akses', icon: KeyRound, rbacOnly: true, description: 'Atur hak lihat/ubah per modul dan hak khusus untuk setiap peran.' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { id: 'notifications', label: 'Notifikasi', icon: Send, description: 'Kirim notifikasi sistem ke Telegram.' },
      { id: 'backup', label: 'Cadangan & Pemulihan', icon: HardDrive, description: 'Buat, unduh, unggah, dan pulihkan cadangan database.' },
      { id: 'agentic', label: 'AIRA (MCP)', icon: AiraIcon, rbacOnly: true, description: 'Status AIRA, token MCP untuk engine AIRA, dan riwayat panggilan tool.' },
      { id: 'appearance', label: 'Tampilan', icon: Palette, description: 'Tema terang atau gelap, dan tingkat gerak animasi.' },
      { id: 'about', label: 'Tentang', icon: Info, description: 'Versi aplikasi, pembaruan, dan riwayat perubahan.' },
    ],
  },
];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'company';

/** Nav filtered by what the user may see; empty groups are dropped. */
export function visibleSettingsNav(canManageRbac: boolean): SettingsNavGroup[] {
  return SETTINGS_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.rbacOnly || canManageRbac) }))
    .filter((g) => g.items.length > 0);
}

/** Resolves ?tab= to a visible section, falling back to the default. */
export function resolveSettingsTab(raw: string | null, nav: SettingsNavGroup[]): SettingsNavItem {
  const items = nav.flatMap((g) => g.items);
  return items.find((i) => i.id === raw) ?? items.find((i) => i.id === DEFAULT_SETTINGS_TAB) ?? items[0];
}
