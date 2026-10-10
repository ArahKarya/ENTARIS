// Keeps GaVehicleData.odometerTerakhir in sync with odometer readings from service, fuel,
// oil and inspection logs. The vehicle data row is created when missing, and the last
// odometer only ever moves up (a lower or equal reading never overwrites it).

import type { Prisma } from '@prisma/client';

type OdometerDb = Pick<Prisma.TransactionClient, 'gaVehicleData'>;

export async function bumpVehicleOdometer(
  db: OdometerDb,
  assetId: string,
  reading: number | null | undefined,
): Promise<void> {
  if (reading == null || !Number.isInteger(reading) || reading < 0) return;
  await db.gaVehicleData.upsert({
    where: { assetId },
    create: { assetId, odometerTerakhir: reading },
    update: {},
  });
  // Conditional write so concurrent logs cannot move the odometer backwards.
  await db.gaVehicleData.updateMany({
    where: { assetId, OR: [{ odometerTerakhir: null }, { odometerTerakhir: { lt: reading } }] },
    data: { odometerTerakhir: reading },
  });
}
