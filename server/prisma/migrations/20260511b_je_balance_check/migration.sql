-- Enforce the double-entry invariant at the database level: every Submitted
-- (or otherwise active) journal entry must have SUM(debit) = SUM(credit).
-- Up to now this was only checked in application code; a bad import, raw SQL
-- migration, or future regression could silently produce an unbalanced JE.
--
-- The trigger is DEFERRABLE INITIALLY DEFERRED so that Prisma's nested
-- create (insert parent JE + N item rows within one statement) succeeds —
-- the check fires at COMMIT once every row is in place.
--
-- Draft / Cancelled JEs are exempt (Drafts may be in progress; Cancelled
-- rows keep their items for audit trail but no longer need to balance).

CREATE OR REPLACE FUNCTION check_journal_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
  v_je_id TEXT;
  v_status TEXT;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_je_id := OLD.journal_entry_id;
  ELSE
    v_je_id := NEW.journal_entry_id;
  END IF;

  SELECT status::text INTO v_status FROM journal_entries WHERE id = v_je_id;

  -- JE may have been deleted in the same transaction (cascade); skip.
  IF v_status IS NULL THEN
    RETURN NULL;
  END IF;

  -- Drafts can be unbalanced while user edits; Cancelled rows are frozen.
  IF v_status NOT IN ('Submitted') THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM journal_entry_accounts
  WHERE journal_entry_id = v_je_id;

  -- Tolerate sub-cent rounding from Decimal arithmetic.
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION
      'Journal entry % is unbalanced: debit=%, credit=% (diff=%)',
      v_je_id, v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_entry_balanced ON journal_entry_accounts;

CREATE CONSTRAINT TRIGGER trg_journal_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_accounts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balanced();
