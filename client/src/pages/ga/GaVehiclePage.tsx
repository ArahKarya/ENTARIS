/**
 * Fleet (/ga/vehicle); ?vehicle=<id>&section=… opens a vehicle. List filters stay in the URL while a
 * vehicle is open, so the breadcrumb returns to the same list. Writes need ga_vehicle edit.
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { can, cap } from '@/lib/permissions';
import { FleetListView } from '@/components/ga/vehicle/FleetListView';
import { VehicleDetailView } from '@/components/ga/vehicle/VehicleDetailView';
import { DEFAULT_SECTION, SECTION_PARAM, VEHICLE_PARAM, type VehicleSection } from '@/components/ga/vehicle/constants';
import { parseSection } from '@/components/ga/vehicle/vehicle-model';

export const GaVehiclePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const vehicleId = searchParams.get(VEHICLE_PARAM);
  const section = parseSection(searchParams.get(SECTION_PARAM));
  const canEdit = can('ga_vehicle', 'edit');
  const canApprove = cap('approval.decide');

  const patch = useCallback(
    (values: Record<string, string | null>, replace = false) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(values)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace },
      ),
    [setSearchParams],
  );

  const open = useCallback(
    (id: string, s?: VehicleSection) => patch({ [VEHICLE_PARAM]: id, [SECTION_PARAM]: s && s !== DEFAULT_SECTION ? s : null }),
    [patch],
  );
  const back = useCallback(() => patch({ [VEHICLE_PARAM]: null, [SECTION_PARAM]: null }), [patch]);

  if (vehicleId) {
    const listParams = new URLSearchParams(searchParams);
    listParams.delete(VEHICLE_PARAM);
    listParams.delete(SECTION_PARAM);
    const qs = listParams.toString();
    return (
      <VehicleDetailView
        key={vehicleId}
        assetId={vehicleId}
        section={section}
        onSectionChange={(s) => patch({ [SECTION_PARAM]: s === DEFAULT_SECTION ? null : s }, true)}
        onBack={back}
        backHref={`/ga/vehicle${qs ? `?${qs}` : ''}`}
        canEdit={canEdit}
        canApprove={canApprove}
      />
    );
  }
  return <FleetListView canEdit={canEdit} onOpen={open} />;
};

export default GaVehiclePage;
