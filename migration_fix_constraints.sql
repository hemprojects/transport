-- 1. Disable foreign keys temporarily to avoid issues with order of operations
PRAGMA foreign_keys = OFF;

-- 2. Create new table with updated constraints including 'paused' status and 'other' task type
CREATE TABLE tasks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL DEFAULT 'transport' CHECK(task_type IN ('unloading', 'transport', 'loading', 'other')),
    description TEXT NOT NULL,
    material TEXT,
    location_from TEXT,
    location_to TEXT,
    department TEXT,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('high', 'normal', 'low')),
    sort_order INTEGER DEFAULT 0,
    from_yesterday INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled', 'paused')),
    assigned_to INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    started_at DATETIME,
    completed_at DATETIME,
    paused_at DATETIME,
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 3. Copy data strictly mapping existing columns. 
-- SAFETY: 
-- 1. We use '0' for from_yesterday and 'NULL' for paused_at to avoid errors if these columns don't exist.
-- 2. We check if assigned_to/created_by users actually exist to prevent FOREIGN KEY errors (orphaned tasks).
INSERT INTO tasks_new (
    id, task_type, description, material, location_from, location_to, department, 
    scheduled_date, scheduled_time, priority, sort_order, from_yesterday, status, 
    assigned_to, notes, created_at, created_by, started_at, completed_at, paused_at
)
SELECT 
    t.id, t.task_type, t.description, t.material, t.location_from, t.location_to, t.department, 
    t.scheduled_date, t.scheduled_time, t.priority, t.sort_order, 
    0, -- Default for from_yesterday
    t.status, 
    -- Check if assigned user exists, otherwise set NULL
    CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = t.assigned_to) THEN t.assigned_to ELSE NULL END,
    t.notes, t.created_at, 
    -- Check if creator exists, otherwise set NULL
    CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = t.created_by) THEN t.created_by ELSE NULL END,
    t.started_at, t.completed_at, 
    NULL -- Default for paused_at
FROM tasks t;

-- 4. Drop old table
DROP TABLE tasks;

-- 5. Rename new table
ALTER TABLE tasks_new RENAME TO tasks;

-- 6. Re-enable foreign keys
PRAGMA foreign_keys = ON;
