-- Performance: composite indexes for hot read paths.
-- Trial Balance, Account Statement, and Stock Card queries all filter by
-- (account_id|item_id, date) and exclude is_cancelled. The existing single-
-- column indexes force a wide index scan + filter; composite covers it.

CREATE INDEX IF NOT EXISTS ale_account_date_active_idx
  ON accounting_ledger_entries (account_id, date)
  WHERE is_cancelled = false;

CREATE INDEX IF NOT EXISTS sm_item_date_active_idx
  ON stock_movements (item_id, date)
  WHERE is_cancelled = false;

CREATE INDEX IF NOT EXISTS ale_ref_type_id_idx
  ON accounting_ledger_entries (reference_type, reference_id);
