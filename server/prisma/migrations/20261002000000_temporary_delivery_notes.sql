-- 2026-10-02: Modul Surat Jalan Sementara (SJS).
-- Dokumen pengiriman SEMENTARA: tidak menyentuh stok/GL/WAC, tidak bisa diinvoice.
-- Ditautkan ke DO resmi setelah produksi diinput. Hanya TABEL BARU (idempoten).

CREATE TABLE IF NOT EXISTS temporary_delivery_notes (
  id                TEXT PRIMARY KEY,
  number            TEXT NOT NULL,
  date              TIMESTAMP(3) NOT NULL,
  party_id          TEXT NOT NULL,
  nomor_mobil       TEXT,
  driver_name       TEXT,
  recipient_name    TEXT,
  sales_order_id    TEXT,
  status            TEXT NOT NULL DEFAULT 'Open',  -- Open | Linked | Cancelled
  notes             TEXT,
  delivery_order_id TEXT,
  linked_at         TIMESTAMP(3),
  fiscal_year_id    TEXT NOT NULL,
  created_by        TEXT NOT NULL,
  cancelled_at      TIMESTAMP(3),
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS temporary_delivery_notes_number_key ON temporary_delivery_notes (number);
CREATE INDEX IF NOT EXISTS temporary_delivery_notes_party_idx ON temporary_delivery_notes (party_id);
CREATE INDEX IF NOT EXISTS temporary_delivery_notes_status_idx ON temporary_delivery_notes (status);
CREATE INDEX IF NOT EXISTS temporary_delivery_notes_do_idx ON temporary_delivery_notes (delivery_order_id);
CREATE INDEX IF NOT EXISTS temporary_delivery_notes_date_idx ON temporary_delivery_notes (date);

CREATE TABLE IF NOT EXISTS temporary_delivery_note_items (
  id                          TEXT PRIMARY KEY,
  temporary_delivery_note_id  TEXT NOT NULL REFERENCES temporary_delivery_notes(id) ON DELETE CASCADE,
  inventory_item_id           TEXT,
  item_name                   TEXT NOT NULL,
  quantity                    DECIMAL(15,3) NOT NULL,
  unit                        TEXT NOT NULL,
  description                 TEXT,
  created_at                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS temporary_delivery_note_items_note_idx ON temporary_delivery_note_items (temporary_delivery_note_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tdn_party_fk') THEN
    ALTER TABLE temporary_delivery_notes ADD CONSTRAINT tdn_party_fk FOREIGN KEY (party_id) REFERENCES parties(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tdn_do_fk') THEN
    ALTER TABLE temporary_delivery_notes ADD CONSTRAINT tdn_do_fk FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id);
  END IF;
END $$;
