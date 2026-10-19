-- CreateTable
CREATE TABLE "system_account_mappings" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_account_mappings_role_idx" ON "system_account_mappings"("role");

-- CreateIndex
CREATE UNIQUE INDEX "system_account_mappings_role_account_id_key" ON "system_account_mappings"("role", "account_id");

-- AddForeignKey
ALTER TABLE "system_account_mappings" ADD CONSTRAINT "system_account_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Populate default system account mappings from existing accounts
INSERT INTO system_account_mappings (id, role, account_id, sort_order, created_at, updated_at)
SELECT gen_random_uuid(), 'CASH', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.1.1'
UNION ALL
SELECT gen_random_uuid(), 'CASH', id, 1, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.1.2'
UNION ALL
SELECT gen_random_uuid(), 'CASH', id, 2, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.1.3'
UNION ALL
SELECT gen_random_uuid(), 'CASH', id, 3, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.1.4'
UNION ALL
SELECT gen_random_uuid(), 'CASH', id, 4, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.1.5'
UNION ALL
SELECT gen_random_uuid(), 'AR', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.2.1'
UNION ALL
SELECT gen_random_uuid(), 'INVENTORY', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.4.0'
UNION ALL
SELECT gen_random_uuid(), 'AP', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '2.1.1'
UNION ALL
SELECT gen_random_uuid(), 'SALES', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '4.1'
UNION ALL
SELECT gen_random_uuid(), 'SERVICE_REVENUE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '4.2'
UNION ALL
SELECT gen_random_uuid(), 'VENDOR_DEPOSIT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.3'
UNION ALL
SELECT gen_random_uuid(), 'CUSTOMER_DEPOSIT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '2.1.2'
UNION ALL
SELECT gen_random_uuid(), 'COGS', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '5'
UNION ALL
SELECT gen_random_uuid(), 'OPENING_EQUITY', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '3.1'
UNION ALL
SELECT gen_random_uuid(), 'RETAINED_EARNINGS', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '3.2'
UNION ALL
SELECT gen_random_uuid(), 'CURRENT_PROFIT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '3.4'
ON CONFLICT DO NOTHING;
