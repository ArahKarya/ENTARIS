-- Uang Jaminan Proyek (Project Guarantee).
-- Setoran jaminan (tender/pelaksanaan/pemeliharaan) ke pemberi proyek;
-- dikembalikan / dipotong penalti / hangus via settlements (bisa parsial).
-- Setor: DR Uang Jaminan (1.8) / CR Kas-Bank. Settlement: DR Kas-Bank +
-- DR Beban (hangus) / CR Uang Jaminan. Lihat routes/projectGuarantees.ts.
-- Plain-scalar FK (account/journal_entry/fiscal_year/created_by) sengaja
-- tanpa relation Prisma supaya tak menambah back-relation di banyak model.

CREATE TABLE IF NOT EXISTS project_guarantees (
  id                   text NOT NULL,
  guarantee_number     text NOT NULL,
  date                 timestamp without time zone NOT NULL,
  party_id             text NOT NULL,
  guarantee_type       text NOT NULL,
  project_name         text NOT NULL,
  reference_no         text,
  amount               numeric(15,2) NOT NULL,
  account_id           text NOT NULL,
  expected_return_date timestamp without time zone,
  notes                text,
  status               text NOT NULL DEFAULT 'Disetor',
  journal_entry_id     text,
  fiscal_year_id       text NOT NULL,
  created_by           text NOT NULL,
  submitted_at         timestamp without time zone,
  cancelled_at         timestamp without time zone,
  created_at           timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT project_guarantees_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_guarantees_guarantee_number_key ON project_guarantees(guarantee_number);
CREATE INDEX IF NOT EXISTS project_guarantees_party_id_idx ON project_guarantees(party_id);
CREATE INDEX IF NOT EXISTS project_guarantees_status_idx ON project_guarantees(status);
CREATE INDEX IF NOT EXISTS project_guarantees_date_idx ON project_guarantees(date);
CREATE INDEX IF NOT EXISTS project_guarantees_expected_return_date_idx ON project_guarantees(expected_return_date);
CREATE INDEX IF NOT EXISTS project_guarantees_fiscal_year_id_idx ON project_guarantees(fiscal_year_id);

DO $$ BEGIN
  ALTER TABLE project_guarantees ADD CONSTRAINT project_guarantees_party_id_fkey
    FOREIGN KEY (party_id) REFERENCES parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS project_guarantee_settlements (
  id                 text NOT NULL,
  guarantee_id       text NOT NULL,
  date               timestamp without time zone NOT NULL,
  return_amount      numeric(15,2) NOT NULL DEFAULT 0,
  forfeit_amount     numeric(15,2) NOT NULL DEFAULT 0,
  return_account_id  text,
  forfeit_account_id text,
  journal_entry_id   text,
  notes              text,
  is_cancelled       boolean NOT NULL DEFAULT false,
  cancelled_at       timestamp without time zone,
  created_by         text NOT NULL,
  created_at         timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT project_guarantee_settlements_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS project_guarantee_settlements_guarantee_id_idx ON project_guarantee_settlements(guarantee_id);

DO $$ BEGIN
  ALTER TABLE project_guarantee_settlements ADD CONSTRAINT project_guarantee_settlements_guarantee_id_fkey
    FOREIGN KEY (guarantee_id) REFERENCES project_guarantees(id) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
