-- Migracja: Nadanie uprawnień (Tylko UPDATE)
-- Data: 2026-01-14
-- Uruchom to, jeśli kolumny już istnieją (błędy duplicate column)

-- UPDATE: Nadanie wszystkich uprawnień istniejącym administratorom
UPDATE users SET perm_reports = 1, perm_users = 1, perm_locations = 1 WHERE role = 'admin';
