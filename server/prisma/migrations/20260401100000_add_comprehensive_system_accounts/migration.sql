-- Add new COA accounts required for comprehensive system account roles

-- 1.2.5 Cadangan Kerugian Piutang (contra asset)
INSERT INTO "accounts" ("id", "accountNumber", "name", "accountType", "rootType", "isGroup", "isActive", "parentId", "balance", "currency", "createdAt", "updatedAt")
SELECT gen_random_uuid(), '1.2.5', 'Cadangan Kerugian Piutang', 'ASSET', 'ASSET', false, true, id, 0, 'IDR', NOW(), NOW()
FROM "accounts" WHERE "accountNumber" = '1.2'
ON CONFLICT ("accountNumber") DO NOTHING;

-- 3.5 Prive (equity)
INSERT INTO "accounts" ("id", "accountNumber", "name", "accountType", "rootType", "isGroup", "isActive", "parentId", "balance", "currency", "createdAt", "updatedAt")
SELECT gen_random_uuid(), '3.5', 'Prive', 'EQUITY', 'EQUITY', false, true, id, 0, 'IDR', NOW(), NOW()
FROM "accounts" WHERE "accountNumber" = '3'
ON CONFLICT ("accountNumber") DO NOTHING;

-- 6.27 Beban Piutang Tak Tertagih (expense)
INSERT INTO "accounts" ("id", "accountNumber", "name", "accountType", "rootType", "isGroup", "isActive", "parentId", "balance", "currency", "createdAt", "updatedAt")
SELECT gen_random_uuid(), '6.27', 'Beban Piutang Tak Tertagih', 'EXPENSE', 'EXPENSE', false, true, id, 0, 'IDR', NOW(), NOW()
FROM "accounts" WHERE "accountNumber" = '6'
ON CONFLICT ("accountNumber") DO NOTHING;

-- 8.8 Pembulatan & Selisih (expense)
INSERT INTO "accounts" ("id", "accountNumber", "name", "accountType", "rootType", "isGroup", "isActive", "parentId", "balance", "currency", "createdAt", "updatedAt")
SELECT gen_random_uuid(), '8.8', 'Pembulatan & Selisih', 'EXPENSE', 'EXPENSE', false, true, id, 0, 'IDR', NOW(), NOW()
FROM "accounts" WHERE "accountNumber" = '8'
ON CONFLICT ("accountNumber") DO NOTHING;

-- Insert new system account mappings
INSERT INTO system_account_mappings (id, role, account_id, sort_order, created_at, updated_at)
-- Pajak
SELECT gen_random_uuid(), 'TAX_INPUT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.5.3'
UNION ALL
SELECT gen_random_uuid(), 'TAX_OUTPUT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '2.2.1'
UNION ALL
SELECT gen_random_uuid(), 'INCOME_TAX_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.17'
UNION ALL
-- Diskon & Retur
SELECT gen_random_uuid(), 'SALES_DISCOUNT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '4.4'
UNION ALL
SELECT gen_random_uuid(), 'SALES_RETURN', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '4.3'
UNION ALL
-- Pengiriman
SELECT gen_random_uuid(), 'SHIPPING_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.14'
UNION ALL
-- Aset Tetap
SELECT gen_random_uuid(), 'FIXED_ASSET', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.6.1'
UNION ALL
SELECT gen_random_uuid(), 'FIXED_ASSET', id, 1, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.6.2'
UNION ALL
SELECT gen_random_uuid(), 'FIXED_ASSET', id, 2, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.6.3'
UNION ALL
SELECT gen_random_uuid(), 'FIXED_ASSET', id, 3, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.6.4'
UNION ALL
SELECT gen_random_uuid(), 'FIXED_ASSET', id, 4, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.6.5'
UNION ALL
-- Akumulasi Penyusutan
SELECT gen_random_uuid(), 'ACCUM_DEPRECIATION', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.7.1'
UNION ALL
SELECT gen_random_uuid(), 'ACCUM_DEPRECIATION', id, 1, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.7.2'
UNION ALL
SELECT gen_random_uuid(), 'ACCUM_DEPRECIATION', id, 2, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.7.3'
UNION ALL
SELECT gen_random_uuid(), 'ACCUM_DEPRECIATION', id, 3, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.7.4'
UNION ALL
-- Beban Penyusutan
SELECT gen_random_uuid(), 'DEPRECIATION_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.21'
UNION ALL
SELECT gen_random_uuid(), 'DEPRECIATION_EXPENSE', id, 1, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.22'
UNION ALL
SELECT gen_random_uuid(), 'DEPRECIATION_EXPENSE', id, 2, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.23'
UNION ALL
SELECT gen_random_uuid(), 'DEPRECIATION_EXPENSE', id, 3, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.24'
UNION ALL
-- Biaya Bank & Bunga
SELECT gen_random_uuid(), 'BANK_CHARGE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.2'
UNION ALL
SELECT gen_random_uuid(), 'INTEREST_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.1'
UNION ALL
SELECT gen_random_uuid(), 'INTEREST_INCOME', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '7.1'
UNION ALL
-- Selisih Kurs
SELECT gen_random_uuid(), 'FX_GAIN_LOSS', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.4'
UNION ALL
SELECT gen_random_uuid(), 'FX_UNREALIZED', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.5'
UNION ALL
-- Piutang Tak Tertagih
SELECT gen_random_uuid(), 'BAD_DEBT_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '6.27'
UNION ALL
SELECT gen_random_uuid(), 'ALLOWANCE_DOUBTFUL', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.2.5'
UNION ALL
-- Akrual & Dibayar Dimuka
SELECT gen_random_uuid(), 'PREPAID_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.5.1'
UNION ALL
SELECT gen_random_uuid(), 'PREPAID_EXPENSE', id, 1, NOW(), NOW() FROM accounts WHERE "accountNumber" = '1.5.2'
UNION ALL
SELECT gen_random_uuid(), 'ACCRUED_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '2.2.6'
UNION ALL
-- Ekuitas
SELECT gen_random_uuid(), 'OWNER_DRAWING', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '3.5'
UNION ALL
-- Pendapatan & Beban Lain-lain
SELECT gen_random_uuid(), 'OTHER_INCOME', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '7.4'
UNION ALL
SELECT gen_random_uuid(), 'OTHER_EXPENSE', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.7'
UNION ALL
-- Pembulatan
SELECT gen_random_uuid(), 'ROUNDING_ACCOUNT', id, 0, NOW(), NOW() FROM accounts WHERE "accountNumber" = '8.8'
ON CONFLICT DO NOTHING;
