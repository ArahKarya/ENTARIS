import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { can } from '../../lib/permissions';

export type MaintenanceKind = 'schedule' | 'workOrder' | 'vehicleTax' | 'vehicleInsurance' | 'document';
export type MaintenanceDueState = 'overdue' | 'today' | 'soon' | 'scheduled';

export interface MaintenanceUpcomingItem {
  key: string;
  kind: MaintenanceKind;
  kindLabel: string;
  title: string;
  assetName: string | null;
  dueAt: string;
  daysLeft: number;
  state: MaintenanceDueState;
  href: string;
}

export interface MaintenanceAttentionItem {
  key: string;
  tone: 'danger' | 'warning';
  title: string;
  detail: string;
  href: string;
}

export interface MaintenanceDashboardData {
  access: { maintenance: boolean; vehicle: boolean; documents: boolean };
  kpi: { overdue: number; dueThisWeek: number; overdueSchedules: number; overdueWorkOrders: number; expired: number; expiring: number };
  attention: MaintenanceAttentionItem[];
  upcoming: MaintenanceUpcomingItem[];
}

/** Any of the EAM modules behind the Pemeliharaan summary (server re-checks each one). */
export const canViewMaintenance = (): boolean =>
  can('ga_maintenance', 'view') || can('ga_vehicle', 'view') || can('ga_documents', 'view');

/** One shared query for the KPI tile, the attention rows and the upcoming widget. */
export function useMaintenanceDashboard(enabled: boolean) {
  return useQuery<MaintenanceDashboardData>({
    queryKey: ['dashboard-maintenance'],
    queryFn: async () => (await api.get('/dashboard/maintenance')).data,
    enabled,
  });
}
