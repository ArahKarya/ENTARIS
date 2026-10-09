/**
 * Vehicle detail (?vehicle=<id>&section=<key>): header with identity and
 * compliance markers, then one tab per section. Only the active section
 * mounts, so each loads its own data on demand.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, QrCode } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, LoadingState, PageHeader, StatusBadge, type Paginated } from '@/components/shared';
import GaAssetQRModal from '@/components/GaAssetQRModal';
import GaVehicleReportTab from '@/components/GaVehicleReportTab';
import { VEHICLE_SECTIONS, type VehicleSection } from './constants';
import { DocumentsSection } from './sections/DocumentsSection';
import { FuelSection } from './sections/FuelSection';
import { IncidentSection } from './sections/IncidentSection';
import { InspectionSection } from './sections/InspectionSection';
import { InsuranceSection } from './sections/InsuranceSection';
import { OverviewSection } from './sections/OverviewSection';
import { ServiceSection } from './sections/ServiceSection';
import { TaxSection } from './sections/TaxSection';
import { TireOilSection } from './sections/TireOilSection';
import type { AssetDetail, VehicleContext } from './types';
import { vehicleKeys } from './vehicle-queries';
import { FLEET_DOC_LABELS, attentionItems, vehicleTitle, type FleetRow } from './vehicle-model';
import { DueMarker } from './vehicle-ui';

interface VehicleDetailViewProps {
  assetId: string;
  section: VehicleSection;
  onSectionChange: (section: VehicleSection) => void;
  onBack: () => void;
  backHref: string;
  canEdit: boolean;
  canApprove: boolean;
}

export function VehicleDetailView({ assetId, section, onSectionChange, onBack, backHref, canEdit, canApprove }: VehicleDetailViewProps) {
  const [showQr, setShowQr] = useState(false);

  const rowQuery = useQuery({
    queryKey: [...vehicleKeys.fleetList, 'row', assetId],
    queryFn: async () => (await api.get<Paginated<FleetRow>>('/ga/vehicle/fleet', { params: { id: assetId, limit: 1 } })).data.data[0] ?? null,
  });
  // Driver, NBV, QR and photos come from the GA asset (needs ga_assets view); optional.
  const assetQuery = useQuery<AssetDetail>({
    queryKey: vehicleKeys.assetDetail(assetId),
    queryFn: async () => (await api.get(`/ga/assets/${assetId}`)).data,
    retry: false,
  });

  const row = rowQuery.data ?? null;
  const asset = assetQuery.data;

  if (rowQuery.isLoading) return <LoadingState label="Memuat data kendaraan…" />;
  if (rowQuery.isError || !row) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader title="Kendaraan" breadcrumbs={[{ label: 'Kendaraan', href: backHref }, { label: 'Detail' }]} />
        <EmptyState
          kind={rowQuery.isError ? 'error' : 'empty'}
          title={rowQuery.isError ? undefined : 'Kendaraan tidak ditemukan'}
          description={rowQuery.isError ? undefined : 'Aset ini tidak ada atau bukan kategori kendaraan.'}
          action={
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft aria-hidden />
              Kembali ke daftar
            </Button>
          }
        />
      </div>
    );
  }

  const ctx: VehicleContext = { assetId, canEdit, canApprove };
  const title = vehicleTitle(row);
  const model = [row.brand, row.tipe].filter(Boolean).join(' ');
  const issues = attentionItems(row);

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: 'Kendaraan', href: backHref }, { label: title }]}
        description={
          <>
            {model || row.name}
            <span className="num"> · {row.code}</span>
            {row.driver?.fullName ? ` · Driver: ${row.driver.fullName}` : ''}
          </>
        }
        actions={
          <>
            <StatusBadge status={row.status} docType="ga_asset" />
            <Button variant="outline" size="sm" onClick={onBack} className="sm:hidden">
              <ArrowLeft aria-hidden />
              Daftar
            </Button>
            {asset?.qr && (
              <Button variant="outline" size="sm" onClick={() => setShowQr(true)}>
                <QrCode aria-hidden />
                QR aset
              </Button>
            )}
          </>
        }
      >
        {issues.length > 0 && (
          <ul aria-label="Perlu tindakan" className="flex flex-wrap gap-x-4 gap-y-1">
            {issues.map((i) => (
              <li key={i.doc}>
                <DueMarker state={i.state} prefix={FLEET_DOC_LABELS[i.doc]} />
              </li>
            ))}
          </ul>
        )}
      </PageHeader>

      <Tabs value={section} onValueChange={(v) => onSectionChange(v as VehicleSection)}>
        <TabsList variant="underline" aria-label="Bagian detail kendaraan" className="-mx-4 px-4 sm:mx-0 sm:px-0">
          {VEHICLE_SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="ringkasan" className="mt-4">
          <OverviewSection {...ctx} row={row} asset={asset} assetUnavailable={assetQuery.isError} onNavigate={onSectionChange} />
        </TabsContent>
        <TabsContent value="servis" className="mt-4">
          <ServiceSection {...ctx} />
        </TabsContent>
        <TabsContent value="pajak" className="mt-4">
          <TaxSection {...ctx} />
        </TabsContent>
        <TabsContent value="asuransi" className="mt-4">
          <InsuranceSection {...ctx} />
        </TabsContent>
        <TabsContent value="bbm" className="mt-4">
          <FuelSection {...ctx} />
        </TabsContent>
        <TabsContent value="ban-oli" className="mt-4">
          <TireOilSection {...ctx} odometer={row.odometer} />
        </TabsContent>
        <TabsContent value="inspeksi" className="mt-4">
          <InspectionSection
            {...ctx}
            pdfAsset={{
              code: row.code,
              name: row.name,
              noPlat: row.noPlat,
              brand: row.brand,
              tipe: row.tipe,
              categoryName: row.categoryName,
            }}
          />
        </TabsContent>
        <TabsContent value="insiden" className="mt-4">
          <IncidentSection {...ctx} />
        </TabsContent>
        <TabsContent value="dokumen" className="mt-4">
          <DocumentsSection {...ctx} />
        </TabsContent>
        <TabsContent value="laporan" className="mt-4">
          <GaVehicleReportTab assetId={assetId} />
        </TabsContent>
      </Tabs>

      <GaAssetQRModal isOpen={showQr} onClose={() => setShowQr(false)} asset={asset ?? null} />
    </div>
  );
}
