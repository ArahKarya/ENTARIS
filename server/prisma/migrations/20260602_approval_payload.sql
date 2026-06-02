-- Approval gate: simpan payload dokumen di antrian sampai disetujui.
-- Dokumen (PI/Produksi) BELUM dibuat saat request; baru dieksekusi saat approve.
-- Maka document_id/document_number bisa null sampai approved, + payload JSON
-- menyimpan body submit asli.

ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE approval_requests ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE approval_requests ALTER COLUMN document_number DROP NOT NULL;
ALTER TABLE approval_requests ALTER COLUMN amount DROP NOT NULL;
