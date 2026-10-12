-- 2026-10-20: Data uji coba (demo) lintas modul. Satu baris per proses pembuatan demo, plus catatan
-- master yang dibuat demo (mitra, item, gudang, aset, ...) agar bisa dihapus tanpa menyentuh master asli.
-- Transaksi demo tidak dicatat per baris: mode uji coba eksklusif mengosongkan seluruh tabel transaksi.
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "demo_data_batches" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "step" TEXT,
    "done_steps" INTEGER NOT NULL DEFAULT 0,
    "total_steps" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "demo_data_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "demo_data_records" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_data_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "demo_data_records_model_record_id_key" ON "demo_data_records"("model", "record_id");
CREATE INDEX IF NOT EXISTS "demo_data_records_batch_id_idx" ON "demo_data_records"("batch_id");

DO $$ BEGIN
  ALTER TABLE "demo_data_records" ADD CONSTRAINT "demo_data_records_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "demo_data_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
