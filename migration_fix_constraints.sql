-- 1. Create new table with updated constraints including 'paused' status and 'other' task type
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

-- 2. Copy data strictly mapping existing columns. 
-- SAFETY: We use '0' for from_yesterday and 'NULL' for paused_at to avoid errors if these columns don't exist yet.
INSERT INTO tasks_new (
    id, task_type, description, material, location_from, location_to, department, 
    scheduled_date, scheduled_time, priority, sort_order, from_yesterday, status, 
    assigned_to, notes, created_at, created_by, started_at, completed_at, paused_at
)
SELECT 
    id, task_type, description, material, location_from, location_to, department, 
    scheduled_date, scheduled_time, priority, sort_order, 
    0, -- Default for from_yesterday (SAFE)
    status, 
    assigned_to, notes, created_at, created_by, started_at, completed_at, 
    NULL -- Default for paused_at (SAFE)
FROM tasks;

-- 3. Drop old table
DROP TABLE tasks;

-- 4. Rename new table
ALTER TABLE tasks_new RENAME TO tasks;
