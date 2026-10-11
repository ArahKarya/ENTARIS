/** Fixed labels the server composes into response data (dashboards, reports, chat). Indonesian -> English. Keys with {n} are patterns (see translateMessage). */
import type { MessageDictionary } from '../types';

export const DATA_MESSAGES: MessageDictionary = {
  // Maintenance dashboard (services/dashboardMaintenance.ts)
  "Jadwal preventif": "Preventive schedule",
  "Perawatan berkala": "Routine maintenance",
  "Work order": "Work order",
  "Pajak STNK": "Vehicle registration tax",
  "STNK 5 tahunan": "5-year registration",
  "KIR": "Roadworthiness test (KIR)",
  "Pajak kendaraan": "Vehicle tax",
  "Asuransi kendaraan": "Vehicle insurance",
  "Asuransi {0}": "Insurance {0}",
  "Dokumen": "Document",
  "{0} jadwal pemeliharaan terlambat": "{0} maintenance schedules overdue",
  "{0} work order lewat target": "{0} work orders past target",
  "{0} pajak/asuransi kendaraan lewat masa berlaku": "{0} vehicle taxes/insurance policies expired",
  "{0} pajak/asuransi kendaraan habis dalam 30 hari": "{0} vehicle taxes/insurance policies expire within 30 days",
  "{0} dokumen legal kedaluwarsa": "{0} legal documents expired",
  "{0} dokumen legal habis dalam 30 hari": "{0} legal documents expire within 30 days",
  "Terlama {0} hari": "Oldest {0} days",
  "Masih terbuka setelah tanggal target": "Still open after the target date",
  "STNK, KIR, pajak, dan polis": "Registration, KIR, tax, and policies",
  "Segera perpanjang": "Renew soon",
  // Receivable/payable aging (routes/dashboard.ts)
  "Belum JT": "Not yet due",
  "1-30 hari": "1-30 days",
  "31-60 hari": "31-60 days",
  "61-90 hari": "61-90 days",
  ">90 hari": ">90 days",
  // Stock snapshot (services/stockSnapshot.ts)
  "Kuantitas dihitung tepat dari riwayat pergerakan stok per tanggal. Nilai memakai harga rata-rata (avg cost) terkini sebagai estimasi.":
    "Quantities are computed exactly from the stock movement history as of the date. Values use the current average cost as an estimate.",
};
