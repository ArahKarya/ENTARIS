/** Lookup queries feeding the production run dialog (cost standards, processes, machines). */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import type { CostStandard, MachineOption } from './run-form-utils';

export function useRunFormLookups(isOpen: boolean, warehouseId: string) {
  // Phase 3: load master cost standards for the picker.
  // Phase 3b: scope by warehouseId — staff hanya lihat standar yg match dengan
  // gudang produksi terpilih atau yg berlaku semua (warehouseId null). Saat
  // warehouse belum dipilih, list disembunyikan untuk menghindari false picks.
  const { data: standardsData } = useQuery({
    queryKey: ['production-cost-standards', 'active', warehouseId],
    queryFn: () => api
      .get('/inventory/production-cost-standards', {
        params: { active: true, ...(warehouseId ? { warehouseId } : {}) },
      })
      .then(r => r.data),
    enabled: isOpen && !!warehouseId,
    staleTime: 60_000,
  });
  const standards: CostStandard[] = standardsData?.data ?? [];

  // Master proses produksi (multiselect untuk traceability)
  const { data: processesData } = useQuery({
    queryKey: ['production-processes-active'],
    queryFn: () => api
      .get('/inventory/production-processes', { params: { active: true } })
      .then(r => r.data),
    enabled: isOpen,
    staleTime: 60_000,
  });
  const allProcesses: { id: string; name: string; description: string | null; sortOrder: number }[] =
    processesData?.data ?? [];

  // OEE: master mesin aktif untuk dropdown.
  const { data: machinesData } = useQuery({
    queryKey: ['machines-active'],
    queryFn: () => api
      .get('/inventory/machines', { params: { active: true } })
      .then(r => r.data),
    enabled: isOpen,
    staleTime: 60_000,
  });
  const machines: MachineOption[] = useMemo(() => machinesData?.data ?? [], [machinesData]);
  const machineById = useMemo(
    () => new Map(machines.map(m => [m.id, m])),
    [machines],
  );

  return { standards, allProcesses, machines, machineById };
}
