-- 2026-10-03: Security — hapus AIRA serviceToken plaintext dari audit log lama.
-- Sebelum fix, respons PUT /api/ai/config/settings (berisi serviceToken) tersimpan
-- utuh di audit_logs.new_values dan bisa dibaca role dengan izin 'audit'.
-- Idempoten: hanya menyentuh baris yang masih punya key serviceToken.

UPDATE audit_logs
SET new_values = new_values - 'serviceToken'
WHERE new_values IS NOT NULL
  AND jsonb_typeof(new_values) = 'object'
  AND new_values ? 'serviceToken';

UPDATE audit_logs
SET old_values = old_values - 'serviceToken'
WHERE old_values IS NOT NULL
  AND jsonb_typeof(old_values) = 'object'
  AND old_values ? 'serviceToken';
