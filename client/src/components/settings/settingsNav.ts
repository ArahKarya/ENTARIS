import {
  Building2, Calendar, Receipt, Shield, KeyRound, Send, HardDrive, Palette, Info, HandCoins,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { AiraIcon } from '@/components/shell/AiraIcon';

export type SettingsTabId =
  | 'company' | 'fiscal' | 'tax' | 'accounts' | 'payment-request-types' | 'roles'
  | 'notifications' | 'backup' | 'agentic' | 'appearance' | 'about';

export type SettingsNavKey =
  | 'company' | 'fiscal' | 'tax' | 'accounts' | 'paymentRequestTypes' | 'roles'
  | 'notifications' | 'backup' | 'agentic' | 'appearance' | 'about';

export type SettingsNavGroupId = 'company' | 'access' | 'system';

/** Labels are not stored here; translate `settings:nav.items.<key>.label|description` at render time. */
export interface SettingsNavItem {
  id: SettingsTabId;
  key: SettingsNavKey;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Only shown to users with the rbac.manage capability. */
  rbacOnly?: boolean;
}

export interface SettingsNavGroup {
  id: SettingsNavGroupId;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    id: 'company',
    items: [
      { id: 'company', key: 'company', icon: Building2 },
      { id: 'fiscal', key: 'fiscal', icon: Calendar },
      { id: 'tax', key: 'tax', icon: Receipt },
      { id: 'accounts', key: 'accounts', icon: Shield },
      { id: 'payment-request-types', key: 'paymentRequestTypes', icon: HandCoins },
    ],
  },
  {
    id: 'access',
    items: [
      { id: 'roles', key: 'roles', icon: KeyRound, rbacOnly: true },
    ],
  },
  {
    id: 'system',
    items: [
      { id: 'notifications', key: 'notifications', icon: Send },
      { id: 'backup', key: 'backup', icon: HardDrive },
      { id: 'agentic', key: 'agentic', icon: AiraIcon, rbacOnly: true },
      { id: 'appearance', key: 'appearance', icon: Palette },
      { id: 'about', key: 'about', icon: Info },
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
