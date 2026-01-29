-- =============================================
-- TransportTracker - Schemat bazy danych
-- =============================================

-- Tabela użytkowników
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('driver', 'admin')),
    
    -- Godziny pracy (dla kierowców)
    work_start TEXT DEFAULT '07:00',
    work_end TEXT DEFAULT '15:00',
    
    -- Uprawnienia granularne (dla adminów)
    perm_reports INTEGER DEFAULT 0,
    perm_users INTEGER DEFAULT 0,
    perm_locations INTEGER DEFAULT 0,
    
    force_pin_change INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela lokalizacji/działów
DROP TABLE IF EXISTS locations;
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'location' CHECK(type IN ('location', 'department')),
    
    -- Pozycja na mapie (w procentach 0-100)
    map_x REAL,
    map_y REAL,
    
    -- Flaga systemowa (1 = nieusuwalna, np. Parking TIR)
    is_system INTEGER DEFAULT 0,
    
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela zadań
DROP TABLE IF EXISTS tasks;
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Typ zadania: unloading (rozładunek), transport (przewożenie), loading (załadunek), other (inne)
    task_type TEXT NOT NULL DEFAULT 'transport' CHECK(task_type IN ('unloading', 'transport', 'loading', 'other')),
    
    -- Wspólne pola
    description TEXT NOT NULL,
    material TEXT,
    
    -- Dla transport (przewożenie)
    location_from TEXT,
    location_to TEXT,
    
    -- Dla unloading/loading (rozładunek/załadunek)
    department TEXT,
    
    -- Planowanie
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    
    -- Priorytet i kolejność
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('high', 'normal', 'low')),
    sort_order INTEGER DEFAULT 0,
    from_yesterday INTEGER DEFAULT 0,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled', 'paused')),
    
    -- Przypisanie
    assigned_to INTEGER,
    
    -- Notatki admina
    notes TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    started_at DATETIME,
    completed_at DATETIME,
    paused_at DATETIME,
    
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Tabela logów/uwag kierowcy podczas zadania
DROP TABLE IF EXISTS task_logs;
CREATE TABLE task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    
    -- Typ logu
    log_type TEXT NOT NULL CHECK(log_type IN ('note', 'delay', 'status_change', 'problem')),
    
    -- Treść
    message TEXT,
    
    -- Dla przestojów
    delay_reason TEXT,
    delay_minutes INTEGER,
    
    -- Timestamp
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabela powiadomień
DROP TABLE IF EXISTS notifications;
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    task_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(scheduled_date, sort_order, priority);
CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- Domyślne dane
INSERT INTO users (name, pin, role) VALUES 
    ('Admin', '656565', 'admin'),
    ('Andrzej', '1111', 'driver'),
    ('Witek', '2222', 'driver');

INSERT INTO locations (name, type) VALUES 
    ('Magazyn Główny', 'location'),
    ('Hala A', 'location'),
    ('Hala B', 'location'),
    ('Hala C', 'location'),
    ('Rampa 1', 'location'),
    ('Rampa 2', 'location'),
    ('Dział Produkcji', 'department'),
    ('Dział Pakowania', 'department'),
    ('Dział Wysyłki', 'department'),
    ('Dział Przyjęć', 'department');

-- Tabela tokenów Pushy (push notifications)
DROP TABLE IF EXISTS pushy_tokens;
CREATE TABLE pushy_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    platform TEXT DEFAULT 'web',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pushy_user ON pushy_tokens(user_id);

-- Tabela sesji (jeśli jeszcze nie ma)
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela rate limiting
DROP TABLE IF EXISTS login_attempts;
CREATE TABLE login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    attempts INTEGER DEFAULT 0,
    blocked_until DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela dodatkowych kierowców do zadania
DROP TABLE IF EXISTS task_drivers;
CREATE TABLE task_drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, user_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabela ścieżek na mapie
DROP TABLE IF EXISTS map_paths;
CREATE TABLE map_paths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    points TEXT NOT NULL, -- JSON array of coordinates e.g. [{"x":10, "y":20}, {"x":50, "y":80}...]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);