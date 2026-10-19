-- Split payment support: 1 payment record can debit/credit multiple accounts
-- (e.g. invoice 280jt → BCA 270jt + Petty 7.5jt + Beban Komisi 2.5jt)

CREATE TABLE "payment_splits" (
  "id"          TEXT            NOT NULL,
  "payment_id"  TEXT            NOT NULL,
  "account_id"  TEXT            NOT NULL,
  "amount"      DECIMAL(15, 2)  NOT NULL,
  "notes"       TEXT,

  CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_splits_payment_id_idx" ON "payment_splits" ("payment_id");
CREATE INDEX "payment_splits_account_id_idx" ON "payment_splits" ("account_id");

ALTER TABLE "payment_splits"
  ADD CONSTRAINT "payment_splits_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_splits"
  ADD CONSTRAINT "payment_splits_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
