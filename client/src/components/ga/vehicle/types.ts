/** API record shapes used by the fleet module (subset of the server payloads). */

type Money = string | number;

export interface VehicleData {
  noPlat?: string | null;
  brand?: string | null;
  tipe?: string | null;
  tahunProduksi?: number | null;
  noMesin?: string | null;
  noRangka?: string | null;
  jenisBBM?: string | null;
  kapasitasTangki?: Money | null;
  warna?: string | null;
  odometerSaatBeli?: number | null;
  odometerTerakhir?: number | null;
  notes?: string | null;
}

export interface AssetDetail {
  id: string;
  code: string;
  name: string;
  status: string;
  condition: string;
  location?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: Money | null;
  category?: { name?: string | null } | null;
  branch?: { name?: string | null } | null;
  pic?: { id: string; fullName: string | null } | null;
  qr?: { qrCode: string } | null;
  fixedAsset?: {
    acquisitionCost: Money;
    accumulatedDepreciation: Money;
    bookValue: Money;
    usefulLifeMonths: number;
  } | null;
}

export interface LinkedDocument {
  id: string;
}

export interface ServiceLog {
  id: string;
  tanggal: string;
  odometer: number | null;
  jenisService: string;
  deskripsi: string;
  bengkel: string | null;
  biaya: Money | null;
  source?: string | null;
  journalEntry?: { entryNumber: string } | null;
  account?: { accountNumber: string; name: string } | null;
}

export interface ServiceRequest {
  id: string;
  jenisService: string;
  deskripsi: string;
  urgensi: string;
  status: string;
  odometer?: number | null;
  rejectedReason?: string | null;
  createdAt?: string;
}

export interface TaxRecord {
  id: string;
  type: string;
  periodYear: number;
  amount: Money | null;
  /** Nominal actually paid via the EAM bill queue (may differ from amount). */
  paidAmount?: Money | null;
  paidAt: string | null;
  dueDate: string;
  status: string;
  notes: string | null;
  document?: LinkedDocument | null;
}

export interface TaxRequest {
  id: string;
  type: string;
  periodYear: number;
  dueDate: string;
  estimatedAmount: Money | null;
  urgensi: string;
  status: string;
  rejectedReason?: string | null;
}

export interface InsuranceRecord {
  id: string;
  type: string;
  provider: string;
  policyNumber: string | null;
  premium: Money | null;
  coverageValue: Money | null;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
  document?: LinkedDocument | null;
}

export interface FuelLog {
  id: string;
  tanggal: string;
  odometer: number | null;
  liters: Money;
  pricePerLiter: Money | null;
  totalCost: Money;
  spbu: string | null;
  driverName: string | null;
}

export interface InspectionPhoto {
  id: string;
  category: string;
  caption?: string | null;
}

export interface Inspection {
  id: string;
  tanggal: string;
  odometer: number | null;
  checklist: Record<string, string> | null;
  overallResult: string;
  notes: string | null;
  inspectorName: string | null;
  fuelLevel: string | null;
  nextDueDate: string | null;
  photos?: InspectionPhoto[];
}

export interface Incident {
  id: string;
  tanggal: string;
  location: string | null;
  driverName: string | null;
  description: string;
  severity: string;
  status: string;
  estimatedCost: Money | null;
  actualCost: Money | null;
  insuranceClaimNo: string | null;
}

export interface Tire {
  id: string;
  serialNumber: string;
  brand: string;
  model: string | null;
  size: string | null;
  position: string;
  installedAt: string;
  installedOdometer: number | null;
  notes: string | null;
  status: string;
}

export interface OilLog {
  id: string;
  tanggal: string;
  odometer: number;
  nextOdometerDue: number;
  brand: string;
  volume: Money;
  notes: string | null;
}

export interface UserOption {
  id: string;
  fullName: string;
}

/** Context every detail section receives. */
export interface VehicleContext {
  assetId: string;
  canEdit: boolean;
  canApprove: boolean;
}
