-- Migracja: Dodanie kolumn uprawnień (RBAC Granular) - Wersja Poprawiona
-- Pomijamy work_start i work_end, bo już istnieją w bazie

-- Dodanie granularnych uprawnień (domyślnie 0 - brak)
-- Uwaga: Jeśli te kolumny też już istnieją, otrzymasz błąd. 
-- W takim przypadku wystarczy uruchomić tylko linię UPDATE.
ALTER TABLE users ADD COLUMN perm_reports INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN perm_users INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN perm_locations INTEGER DEFAULT 0;

-- UPDATE: Nadanie wszystkich uprawnień istniejącym administratorom
-- Aby uniknąć utraty dostępu po wdrożeniu
UPDATE users SET perm_reports = 1, perm_users = 1, perm_locations = 1 WHERE role = 'admin';
