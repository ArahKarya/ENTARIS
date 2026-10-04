-- 2026-10-07: Pengajuan Pembayaran (Payment Request) — stage 1.
-- Tabel baru (jenis pengajuan, pengajuan, baris, lampiran, riwayat) + kolom
-- users.supervisor_id (atasan langsung) + akun sistem "Uang Muka Karyawan"
-- (role EMPLOYEE_ADVANCE, dipakai saat membayar uang muka / perjalanan dinas).
-- Additive only; aman dijalankan ulang tiap startup (IF NOT EXISTS / DO-block).
-- Jenis pengajuan bawaan di-insert hanya bila tabel jenis masih kosong.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supervisor_id" TEXT;

CREATE TABLE IF NOT EXISTS "payment_request_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "default_expense_account_id" TEXT,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "requires_settlement" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_request_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_requests" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "type_id" TEXT NOT NULL,
    "cost_center_id" TEXT,
    "department" TEXT,
    "payee_kind" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "party_id" TEXT,
    "payee_name" TEXT NOT NULL,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_holder" TEXT,
    "purpose" TEXT NOT NULL,
    "needed_by" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "director_role" TEXT,
    "submitted_at" TIMESTAMP(3),
    "supervisor_approved_at" TIMESTAMP(3),
    "finance_approved_at" TIMESTAMP(3),
    "finance_approved_by" TEXT,
    "director_approved_at" TIMESTAMP(3),
    "director_approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "last_note" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "paid_by" TEXT,
    "payment_date" TIMESTAMP(3),
    "cash_account_id" TEXT,
    "journal_entry_id" TEXT,
    "payment_reference" TEXT,
    "settlement_status" TEXT,
    "settled_at" TIMESTAMP(3),
    "settlement_journal_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_request_lines" (
    "id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "expense_account_id" TEXT,
    "cost_center_id" TEXT,
    "expense_date" TIMESTAMP(3),

    CONSTRAINT "payment_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_request_attachments" (
    "id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_request_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payment_request_history" (
    "id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "note" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_request_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_request_types_code_key" ON "payment_request_types"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_number_key" ON "payment_requests"("number");

CREATE UNIQUE INDEX IF NOT EXISTS "payment_requests_journal_entry_id_key" ON "payment_requests"("journal_entry_id");

CREATE INDEX IF NOT EXISTS "payment_requests_requester_id_idx" ON "payment_requests"("requester_id");

CREATE INDEX IF NOT EXISTS "payment_requests_supervisor_id_idx" ON "payment_requests"("supervisor_id");

CREATE INDEX IF NOT EXISTS "payment_requests_status_idx" ON "payment_requests"("status");

CREATE INDEX IF NOT EXISTS "payment_requests_type_id_idx" ON "payment_requests"("type_id");

CREATE INDEX IF NOT EXISTS "payment_requests_created_at_idx" ON "payment_requests"("created_at");

CREATE INDEX IF NOT EXISTS "payment_requests_source_source_ref_idx" ON "payment_requests"("source", "source_ref");

CREATE INDEX IF NOT EXISTS "payment_request_lines_payment_request_id_idx" ON "payment_request_lines"("payment_request_id");

CREATE INDEX IF NOT EXISTS "payment_request_attachments_payment_request_id_idx" ON "payment_request_attachments"("payment_request_id");

CREATE INDEX IF NOT EXISTS "payment_request_history_payment_request_id_created_at_idx" ON "payment_request_history"("payment_request_id", "created_at");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_supervisor_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_types_default_expense_account_id_fkey') THEN
    ALTER TABLE "payment_request_types" ADD CONSTRAINT "payment_request_types_default_expense_account_id_fkey" FOREIGN KEY ("default_expense_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_requester_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_supervisor_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_type_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "payment_request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_cost_center_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "ga_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_party_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_paid_by_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_cash_account_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_journal_entry_id_fkey') THEN
    ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_lines_payment_request_id_fkey') THEN
    ALTER TABLE "payment_request_lines" ADD CONSTRAINT "payment_request_lines_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_lines_expense_account_id_fkey') THEN
    ALTER TABLE "payment_request_lines" ADD CONSTRAINT "payment_request_lines_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_lines_cost_center_id_fkey') THEN
    ALTER TABLE "payment_request_lines" ADD CONSTRAINT "payment_request_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "ga_cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_attachments_payment_request_id_fkey') THEN
    ALTER TABLE "payment_request_attachments" ADD CONSTRAINT "payment_request_attachments_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_history_payment_request_id_fkey') THEN
    ALTER TABLE "payment_request_history" ADD CONSTRAINT "payment_request_history_payment_request_id_fkey" FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_request_history_actor_id_fkey') THEN
    ALTER TABLE "payment_request_history" ADD CONSTRAINT "payment_request_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Akun 1.5.6 "Uang Muka Karyawan" (aset lancar). Hanya dibuat bila nomor masih
-- kosong — akun tenant yang sudah ada tidak pernah diubah.
INSERT INTO accounts (
  id, name, "accountNumber", "accountType", "rootType",
  "isGroup", "isActive", balance, currency, description, "parentId",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'Uang Muka Karyawan',
  '1.5.6',
  'ASSET',
  'ASSET',
  false,
  true,
  0,
  'IDR',
  'Uang muka operasional / perjalanan dinas yang dibayarkan ke karyawan dan wajib dipertanggungjawabkan.',
  (SELECT id FROM accounts WHERE "accountNumber" = '1.5' AND "isGroup" = true LIMIT 1),
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "accountNumber" = '1.5.6')
  -- DB baru: COA belum di-seed saat loose SQL jalan → biarkan seed.ts yang membuat.
  AND EXISTS (SELECT 1 FROM accounts WHERE "accountNumber" = '1.5' AND "isGroup" = true);

-- Petakan role EMPLOYEE_ADVANCE ke akun itu, hanya bila role belum dipetakan
-- dan akun 1.5.6 memang "Uang Muka Karyawan" (bukan akun lain milik tenant).
INSERT INTO system_account_mappings (id, role, account_id, sort_order, created_at, updated_at)
SELECT gen_random_uuid()::text, 'EMPLOYEE_ADVANCE', a.id, 0, NOW(), NOW()
FROM accounts a
WHERE a."accountNumber" = '1.5.6'
  AND a.name = 'Uang Muka Karyawan'
  AND a."isGroup" = false
  AND NOT EXISTS (SELECT 1 FROM system_account_mappings WHERE role = 'EMPLOYEE_ADVANCE');

-- Jenis pengajuan bawaan (master data, bisa diubah di Pengaturan → Jenis Pengajuan).
-- Hanya bila tabel masih kosong, supaya jenis yang sengaja dihapus tidak muncul lagi.
INSERT INTO payment_request_types (id, code, name, kind, description, requires_attachment, requires_settlement, is_active, sort_order, created_at, updated_at)
SELECT gen_random_uuid()::text, v.code, v.name, v.kind, v.description, v.req_att, v.req_set, true, v.sort_order, NOW(), NOW()
FROM (VALUES
  ('REIMBURSE', 'Reimbursement', 'REIMBURSEMENT', 'Penggantian biaya yang sudah dibayar karyawan dengan uang pribadi. Wajib melampirkan nota/kuitansi.', true, false, 10),
  ('VENDOR', 'Pembayaran Vendor', 'VENDOR_PAYMENT', 'Pembayaran langsung ke vendor/pemasok di luar faktur pembelian. Lampirkan tagihan/invoice vendor.', true, false, 20),
  ('CASH_ADV', 'Uang Muka Operasional', 'CASH_ADVANCE', 'Uang muka untuk kebutuhan operasional; wajib dipertanggungjawabkan setelah dipakai.', false, true, 30),
  ('TRAVEL', 'Perjalanan Dinas', 'TRAVEL', 'Uang muka perjalanan dinas (transport, akomodasi, uang harian); wajib dipertanggungjawabkan.', false, true, 40),
  ('ENTERTAIN', 'Jamuan/Entertainment', 'OTHER', 'Biaya jamuan tamu/relasi bisnis. Lampirkan nota dan daftar nominatif.', true, false, 50),
  ('OFFICE', 'Operasional Kantor', 'OTHER', 'Kebutuhan operasional kantor (ATK, konsumsi rapat, kebersihan, dll).', false, false, 60),
  ('OTHER', 'Lain-lain', 'OTHER', 'Pengajuan pembayaran lain yang tidak termasuk jenis di atas.', false, false, 90)
) AS v(code, name, kind, description, req_att, req_set, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM payment_request_types);
