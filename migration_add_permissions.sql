-- Migracja: Dodanie kolumn uprawnień (RBAC Granular)
-- Data: 2026-01-14

-- Dodanie godzin pracy
ALTER TABLE users ADD COLUMN work_start TEXT DEFAULT '07:00';
ALTER TABLE users ADD COLUMN work_end TEXT DEFAULT '15:00';

-- Dodanie granularnych uprawnień (domyślnie 0 - brak)
ALTER TABLE users ADD COLUMN perm_reports INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN perm_users INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN perm_locations INTEGER DEFAULT 0;

-- UPDATE: Nadanie wszystkich uprawnień istniejącym administratorom
-- Aby uniknąć utraty dostępu po wdrożeniu
UPDATE users SET perm_reports = 1, perm_users = 1, perm_locations = 1 WHERE role = 'admin';
