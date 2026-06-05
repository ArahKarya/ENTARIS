import React, { useState } from 'react';
import {
  Calendar, Building2, Settings, Receipt, HardDrive, Info, Shield, Send, KeyRound,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { cap } from '../lib/permissions';
import { FiscalYearsTab } from './settings/FiscalYearsTab';
import { CompanySettingsTab } from './settings/CompanySettingsTab';
import { SystemAccountsTab } from '../components/SystemAccountsTab';
import { TaxConfigTab } from './settings/TaxConfigTab';
import { BackupTab } from './settings/BackupTab';
import { AboutTab } from './settings/AboutTab';
import { NotificationsTab } from './settings/NotificationsTab';
import { RolePermissionsTab } from './settings/RolePermissionsTab';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fiscal' | 'company' | 'accounts' | 'tax' | 'notifications' | 'roles' | 'backup' | 'about'>('fiscal');
  const canManageRbac = cap('rbac.manage');
  const tabs = [
    { id: 'fiscal', label: 'Tahun Buku', icon: Calendar },
    { id: 'company', label: 'Profil Perusahaan', icon: Building2 },
    { id: 'accounts', label: 'Akun Sistem', icon: Shield },
    { id: 'tax', label: 'Pajak', icon: Receipt },
    { id: 'notifications', label: 'Notifikasi', icon: Send },
    ...(canManageRbac ? [{ id: 'roles', label: 'Hak Akses', icon: KeyRound }] : []),
    { id: 'backup', label: 'Backup', icon: HardDrive },
    { id: 'about', label: 'Tentang Aplikasi', icon: Info },
  ];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-2">
        <Settings size={18} className="text-gray-400" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pengaturan</h1>
          <p className="text-sm text-gray-500">Konfigurasi sistem Keuangan.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {activeTab === 'fiscal' && <FiscalYearsTab />}
      {activeTab === 'company' && <CompanySettingsTab />}
      {activeTab === 'accounts' && <SystemAccountsTab />}
      {activeTab === 'tax' && <TaxConfigTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'roles' && canManageRbac && <RolePermissionsTab />}
      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'about' && <AboutTab />}
    </div>
  );
};
