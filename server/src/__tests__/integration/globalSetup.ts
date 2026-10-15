// Prasyarat bersama tes integrasi di database yang baru di-seed (CI): seed membuat admin, akun dan
// pengaturan, tetapi tidak membuat gudang maupun Supplier. Masing-masing dibuat HANYA bila belum ada
// satu pun yang aktif, jadi database dev yang sudah berisi data tidak tersentuh.
import pg from 'pg';

export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return; // tanpa database semua tes integrasi dilewati
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO warehouses (id, code, name, is_active, is_default, created_at, updated_at)
       SELECT gen_random_uuid()::text, 'IT-GUDANG', 'Gudang Uji Integrasi', true, true, now(), now()
       WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE is_active)
       ON CONFLICT (code) DO NOTHING`,
    );
    await client.query(
      `INSERT INTO parties (id, name, "partyType", is_active, created_at, updated_at)
       SELECT gen_random_uuid()::text, 'Supplier Uji Integrasi', 'Supplier', true, now(), now()
       WHERE NOT EXISTS (SELECT 1 FROM parties WHERE is_active AND "partyType" IN ('Supplier', 'Both'))`,
    );
  } finally {
    await client.end();
  }
}
