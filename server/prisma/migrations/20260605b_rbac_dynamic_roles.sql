-- RBAC dinamis: role custom + matriks izin (role × modul → view/edit) + capabilities.
-- Role bawaan & matriks default di-seed idempoten saat boot (services/rbacSeed.ts).
-- Lihat constants/modules.ts. Migrasi ini idempoten (aman dijalankan ulang).

-- 1) users.role: enum UserRole → text (nilai lama 'Admin' dst tetap valid).
ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Accountant';

-- 2) Tabel roles
CREATE TABLE IF NOT EXISTS roles (
  id             text PRIMARY KEY,
  key            text NOT NULL UNIQUE,
  name           text NOT NULL,
  description    text,
  is_system      boolean NOT NULL DEFAULT false,
  is_super_admin boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3) Tabel role_permissions (matriks role × modul)
CREATE TABLE IF NOT EXISTS role_permissions (
  id        text PRIMARY KEY,
  role_id   text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module    text NOT NULL,
  can_view  boolean NOT NULL DEFAULT false,
  can_edit  boolean NOT NULL DEFAULT false,
  UNIQUE (role_id, module)
);

-- 4) Tabel role_capabilities (hak sensitif per role)
CREATE TABLE IF NOT EXISTS role_capabilities (
  id          text PRIMARY KEY,
  role_id     text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  capability  text NOT NULL,
  UNIQUE (role_id, capability)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_capabilities_role_id_idx ON role_capabilities(role_id);
