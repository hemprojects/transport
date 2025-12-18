// =============================================
// TransportTracker - Cloudflare Worker API
// Wersja 2.0
// =============================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            if (path.startsWith('/api/')) {
                return await handleAPI(request, env, path, corsHeaders);
            }
            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(
                JSON.stringify({ error: error.message || 'Internal Server Error' }),
                { status: 500, headers: corsHeaders }
            );
        }
    }
};

// =============================================
// API ROUTER
// =============================================
async function handleAPI(request, env, path, corsHeaders) {
    const method = request.method;

    // AUTH
    if (path === '/api/users' && method === 'GET') {
        return await getUsers(env, corsHeaders);
    }
    if (path === '/api/auth/login' && method === 'POST') {
        return await login(request, env, corsHeaders);
    }

    // USERS
    if (path === '/api/users' && method === 'POST') {
        return await createUser(request, env, corsHeaders);
    }
    if (path.match(/^\/api\/users\/\d+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        return await deleteUser(id, env, corsHeaders);
    }
    if (path.match(/^\/api\/users\/\d+$/) && method === 'PUT') {
        const id = path.split('/').pop();
        return await updateUser(id, request, env, corsHeaders);
    }

    // LOCATIONS
    if (path === '/api/locations' && method === 'GET') {
        return await getLocations(env, corsHeaders);
    }
    if (path === '/api/locations' && method === 'POST') {
        return await createLocation(request, env, corsHeaders);
    }
    if (path.match(/^\/api\/locations\/\d+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        return await deleteLocation(id, env, corsHeaders);
    }

    // TASKS
    if (path === '/api/tasks' && method === 'GET') {
        const url = new URL(request.url);
        return await getTasks(url.searchParams, env, corsHeaders);
    }
    if (path === '/api/tasks' && method === 'POST') {
        return await createTask(request, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'GET') {
        const id = path.split('/').pop();
        return await getTask(id, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'PUT') {
        const id = path.split('/').pop();
        return await updateTask(id, request, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        return await deleteTask(id, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+\/status$/) && method === 'PUT') {
        const id = path.split('/')[3];
        return await updateTaskStatus(id, request, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+\/join$/) && method === 'POST') {
        const id = path.split('/')[3];
        return await joinTask(id, request, env, corsHeaders);
    }
    if (path === '/api/tasks/reorder' && method === 'POST') {
        return await reorderTasks(request, env, corsHeaders);
    }

    // TASK LOGS
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'GET') {
        const taskId = path.split('/')[3];
        return await getTaskLogs(taskId, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'POST') {
        const taskId = path.split('/')[3];
        return await createTaskLog(taskId, request, env, corsHeaders);
    }

    // NOTIFICATIONS
    if (path.match(/^\/api\/notifications\/\d+$/) && method === 'GET') {
        const userId = path.split('/').pop();
        return await getNotifications(userId, env, corsHeaders);
    }
    if (path.match(/^\/api\/notifications\/\d+\/read$/) && method === 'POST') {
        const notifId = path.split('/')[3];
        return await markNotificationRead(notifId, env, corsHeaders);
    }
    if (path.match(/^\/api\/notifications\/user\/\d+\/read-all$/) && method === 'POST') {
        const userId = path.split('/')[4];
        return await markAllNotificationsRead(userId, env, corsHeaders);
    }

    // REPORTS
    if (path === '/api/reports' && method === 'GET') {
        const url = new URL(request.url);
        const period = url.searchParams.get('period') || 'week';
        return await getReports(period, env, corsHeaders);
    }

    return new Response(
        JSON.stringify({ error: 'Not Found' }),
        { status: 404, headers: corsHeaders }
    );
}

// =============================================
// AUTH
// =============================================
async function getUsers(env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name'
    ).all();
    
    return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function login(request, env, corsHeaders) {
    const { userId, pin } = await request.json();
    
    const user = await env.DB.prepare(
        'SELECT id, name, role, force_pin_change FROM users WHERE id = ? AND pin = ? AND active = 1'
    ).bind(userId, pin).first();
    
    if (!user) {
        return new Response(
            JSON.stringify({ error: 'Nieprawidłowy PIN' }),
            { status: 401, headers: corsHeaders }
        );
    }
    
    return new Response(JSON.stringify({ user }), { headers: corsHeaders });
}

// =============================================
// USERS
// =============================================
async function createUser(request, env, corsHeaders) {
    const { name, pin, role } = await request.json();
    
    if (!name || !pin || !role) {
        return new Response(
            JSON.stringify({ error: 'Wszystkie pola są wymagane' }),
            { status: 400, headers: corsHeaders }
        );
    }
    
    const result = await env.DB.prepare(
        'INSERT INTO users (name, pin, role, force_pin_change) VALUES (?, ?, ?, 1)'
    ).bind(name, pin, role).run();
    
    return new Response(
        JSON.stringify({ id: result.meta.last_row_id, name, role }),
        { headers: corsHeaders }
    );
}

async function updateUser(id, request, env, corsHeaders) {
    const { name, pin, role, force_pin_change, work_start, work_end } = await request.json();
    
    let query = 'UPDATE users SET ';
    let params = [];
    let updates = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (pin) { updates.push('pin = ?'); params.push(pin); }
    if (force_pin_change !== undefined) { updates.push('force_pin_change = ?'); params.push(force_pin_change); }
    if (work_start) { updates.push('work_start = ?'); params.push(work_start); }
    if (work_end) { updates.push('work_end = ?'); params.push(work_end); }
    
    if (updates.length === 0) {
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    query += updates.join(', ') + ' WHERE id = ?';
    params.push(id);
    
    await env.DB.prepare(query).bind(...params).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function deleteUser(id, env, corsHeaders) {
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// =============================================
// LOCATIONS
// =============================================
async function getLocations(env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM locations WHERE active = 1 ORDER BY type, name'
    ).all();
    
    return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function createLocation(request, env, corsHeaders) {
    const { name, type = 'location' } = await request.json();
    
    if (!name) {
        return new Response(
            JSON.stringify({ error: 'Nazwa jest wymagana' }),
            { status: 400, headers: corsHeaders }
        );
    }
    
    // Sprawdź czy już istnieje
    const existing = await env.DB.prepare(
        'SELECT id, active FROM locations WHERE name = ?'
    ).bind(name).first();
    
    if (existing) {
        if (existing.active === 0) {
            // Reaktywuj usuniętą lokalizację
            await env.DB.prepare(
                'UPDATE locations SET active = 1, type = ? WHERE id = ?'
            ).bind(type, existing.id).run();
            return new Response(
                JSON.stringify({ id: existing.id, name, type }),
                { headers: corsHeaders }
            );
        }
        return new Response(
            JSON.stringify({ error: 'Lokalizacja o tej nazwie już istnieje' }),
            { status: 400, headers: corsHeaders }
        );
    }
    
    const result = await env.DB.prepare(
        'INSERT INTO locations (name, type) VALUES (?, ?)'
    ).bind(name, type).run();
    
    return new Response(
        JSON.stringify({ id: result.meta.last_row_id, name, type }),
        { headers: corsHeaders }
    );
}

async function deleteLocation(id, env, corsHeaders) {
    await env.DB.prepare('UPDATE locations SET active = 0 WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// =============================================
// TASKS
// =============================================
async function getTasks(params, env, corsHeaders) {
    const date = params.get('date');
    const status = params.get('status');
    const createdBy = params.get('createdBy');
    
    let query = `
        SELECT t.*, 
               u.name as assigned_name, 
               c.name as creator_name,
               t.created_by as creator_id
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        WHERE 1=1
    `;
    let bindings = [];
    
    if (date) {
        query += ' AND t.scheduled_date = ?';
        bindings.push(date);
    }
    
    if (status && status !== 'all') {
        query += ' AND t.status = ?';
        bindings.push(status);
    }
    
    if (createdBy) {
        query += ' AND t.created_by = ?';
        bindings.push(createdBy);
    }
    
    query += ` ORDER BY 
        CASE t.status 
            WHEN 'in_progress' THEN 1 
            WHEN 'pending' THEN 2 
            WHEN 'completed' THEN 3 
        END,
        CASE t.priority 
            WHEN 'high' THEN 1 
            WHEN 'normal' THEN 2 
            WHEN 'low' THEN 3 
        END,
        t.sort_order ASC,
        t.scheduled_time ASC`;
    
    const result = await env.DB.prepare(query).bind(...bindings).all();
    
    return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function getTask(id, env, corsHeaders) {
    const task = await env.DB.prepare(`
        SELECT t.*, 
               u.name as assigned_name, 
               c.name as creator_name,
               t.created_by as creator_id
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        WHERE t.id = ?
    `).bind(id).first();
    
    if (!task) {
        return new Response(
            JSON.stringify({ error: 'Zadanie nie znalezione' }),
            { status: 404, headers: corsHeaders }
        );
    }
    
    const logs = await env.DB.prepare(`
        SELECT tl.*, u.name as user_name
        FROM task_logs tl
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE tl.task_id = ?
        ORDER BY tl.created_at DESC
    `).bind(id).all();
    
    task.logs = logs.results;
    
    const drivers = await env.DB.prepare(`
        SELECT u.id, u.name 
        FROM task_drivers td
        JOIN users u ON td.user_id = u.id
        WHERE td.task_id = ?
    `).bind(id).all();
    
    task.additional_drivers = drivers.results;
    
    return new Response(JSON.stringify(task), { headers: corsHeaders });
}

async function createTask(request, env, corsHeaders) {
    const data = await request.json();
    
    const maxOrder = await env.DB.prepare(
        'SELECT MAX(sort_order) as max FROM tasks WHERE scheduled_date = ?'
    ).bind(data.scheduled_date).first();
    
    const sortOrder = (maxOrder?.max || 0) + 1;
    
    const result = await env.DB.prepare(`
        INSERT INTO tasks (
            task_type, description, material, location_from, location_to,
            department, scheduled_date, scheduled_time, priority, sort_order,
            notes, created_by, assigned_to
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        data.task_type || 'transport',
        data.description,
        data.material || null,
        data.location_from || null,
        data.location_to || null,
        data.department || null,
        data.scheduled_date,
        data.scheduled_time || null,
        data.priority || 'normal',
        sortOrder,
        data.notes || null,
        data.created_by || null,
        data.assigned_to || null
    ).run();
    
    const taskId = result.meta.last_row_id;
    
    // Notify all drivers
    const drivers = await env.DB.prepare(
        'SELECT id FROM users WHERE role = "driver" AND active = 1'
    ).all();
    
    for (const driver of drivers.results) {
        await env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, task_id)
            VALUES (?, 'new_task', 'Nowe zadanie', ?, ?)
        `).bind(
            driver.id,
            `Dodano: ${data.description}`,
            taskId
        ).run();
    }
    
    return new Response(
        JSON.stringify({ id: taskId, success: true }),
        { headers: corsHeaders }
    );
}

async function updateTask(id, request, env, corsHeaders) {
    const data = await request.json();
    
    await env.DB.prepare(`
        UPDATE tasks SET
            task_type = ?,
            description = ?,
            material = ?,
            location_from = ?,
            location_to = ?,
            department = ?,
            scheduled_date = ?,
            scheduled_time = ?,
            priority = ?,
            notes = ?,
            assigned_to = ?
        WHERE id = ?
    `).bind(
        data.task_type || 'transport',
        data.description,
        data.material || null,
        data.location_from || null,
        data.location_to || null,
        data.department || null,
        data.scheduled_date,
        data.scheduled_time || null,
        data.priority || 'normal',
        data.notes || null,
        data.assigned_to || null,
        id
    ).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function deleteTask(id, env, corsHeaders) {
    await env.DB.prepare('DELETE FROM task_logs WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM task_drivers WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM notifications WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}
// =============================================
// TASK STATUS & JOIN
// =============================================
async function updateTaskStatus(id, request, env, corsHeaders) {
    const { status, userId } = await request.json();
    
    let updateQuery = 'UPDATE tasks SET status = ?';
    let bindings = [status];
    
    if (status === 'in_progress') {
        updateQuery += ', started_at = CURRENT_TIMESTAMP, assigned_to = ?';
        bindings.push(userId);
    } else if (status === 'completed') {
        updateQuery += ', completed_at = CURRENT_TIMESTAMP';
    }
    
    updateQuery += ' WHERE id = ?';
    bindings.push(id);
    
    await env.DB.prepare(updateQuery).bind(...bindings).run();
    
    // Log status change
    const statusLabels = {
        'in_progress': 'Rozpoczęto',
        'completed': 'Zakończono',
        'pending': 'Oczekuje'
    };
    
    await env.DB.prepare(`
        INSERT INTO task_logs (task_id, user_id, log_type, message)
        VALUES (?, ?, 'status_change', ?)
    `).bind(id, userId, statusLabels[status] || status).run();
    
    // Notify admins
    const task = await env.DB.prepare('SELECT description FROM tasks WHERE id = ?').bind(id).first();
    const admins = await env.DB.prepare(
        'SELECT id FROM users WHERE role = "admin" AND active = 1'
    ).all();
    
    const statusText = status === 'in_progress' ? 'rozpoczęte' : 
                       status === 'completed' ? 'zakończone' : status;
    
    for (const admin of admins.results) {
        await env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, task_id)
            VALUES (?, 'status_change', 'Zmiana statusu', ?, ?)
        `).bind(
            admin.id,
            `"${task.description}" - ${statusText}`,
            id
        ).run();
    }
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function joinTask(id, request, env, corsHeaders) {
    const { userId } = await request.json();
    
    // Check if already joined
    const existing = await env.DB.prepare(
        'SELECT id FROM task_drivers WHERE task_id = ? AND user_id = ?'
    ).bind(id, userId).first();
    
    if (existing) {
        return new Response(
            JSON.stringify({ error: 'Już dołączyłeś do tego zadania' }),
            { status: 400, headers: corsHeaders }
        );
    }
    
    // Add to task_drivers
    await env.DB.prepare(
        'INSERT INTO task_drivers (task_id, user_id) VALUES (?, ?)'
    ).bind(id, userId).run();
    
    // Get user name
    const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
    
    // Log join
    await env.DB.prepare(`
        INSERT INTO task_logs (task_id, user_id, log_type, message)
        VALUES (?, ?, 'status_change', ?)
    `).bind(id, userId, `${user.name} dołączył do zadania`).run();
    
    // Notify task owner
    const task = await env.DB.prepare(
        'SELECT assigned_to, description FROM tasks WHERE id = ?'
    ).bind(id).first();
    
    if (task.assigned_to && task.assigned_to !== userId) {
        await env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, task_id)
            VALUES (?, 'joined', 'Ktoś dołączył', ?, ?)
        `).bind(
            task.assigned_to,
            `${user.name} dołączył do "${task.description}"`,
            id
        ).run();
    }
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function reorderTasks(request, env, corsHeaders) {
    const { tasks } = await request.json();
    
    for (let i = 0; i < tasks.length; i++) {
        await env.DB.prepare(
            'UPDATE tasks SET sort_order = ? WHERE id = ?'
        ).bind(i + 1, tasks[i]).run();
    }
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// =============================================
// TASK LOGS
// =============================================
async function getTaskLogs(taskId, env, corsHeaders) {
    const result = await env.DB.prepare(`
        SELECT tl.*, u.name as user_name
        FROM task_logs tl
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE tl.task_id = ?
        ORDER BY tl.created_at DESC
    `).bind(taskId).all();
    
    return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function createTaskLog(taskId, request, env, corsHeaders) {
    const { userId, logType, message, delayReason, delayMinutes } = await request.json();
    
    await env.DB.prepare(`
        INSERT INTO task_logs (task_id, user_id, log_type, message, delay_reason, delay_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
        taskId,
        userId,
        logType,
        message || null,
        delayReason || null,
        delayMinutes || null
    ).run();
    
    // Notify admins about delay/problem
    if (logType === 'delay' || logType === 'problem') {
        const task = await env.DB.prepare('SELECT description FROM tasks WHERE id = ?').bind(taskId).first();
        const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
        const admins = await env.DB.prepare(
            'SELECT id FROM users WHERE role = "admin" AND active = 1'
        ).all();
        
        const title = logType === 'delay' ? '⏱️ Przestój' : '⚠️ Problem';
        const delayLabels = {
            'no_access': 'Brak dojazdu',
            'waiting': 'Oczekiwanie',
            'traffic': 'Korki',
            'equipment': 'Problem ze sprzętem',
            'weather': 'Pogoda',
            'break': 'Przerwa',
            'other': 'Inny'
        };
        
        const msgText = logType === 'delay' 
            ? `${user.name}: ${delayLabels[delayReason] || delayReason} (${delayMinutes || 0} min)`
            : `${user.name}: ${message}`;
        
        for (const admin of admins.results) {
            await env.DB.prepare(`
                INSERT INTO notifications (user_id, type, title, message, task_id)
                VALUES (?, ?, ?, ?, ?)
            `).bind(admin.id, logType, title, msgText, taskId).run();
        }
    }
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// =============================================
// NOTIFICATIONS
// =============================================
async function getNotifications(userId, env, corsHeaders) {
    const result = await env.DB.prepare(`
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 50
    `).bind(userId).all();
    
    const unreadCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM notifications 
        WHERE user_id = ? AND is_read = 0
    `).bind(userId).first();
    
    return new Response(
        JSON.stringify({
            notifications: result.results,
            unreadCount: unreadCount.count
        }),
        { headers: corsHeaders }
    );
}

async function markNotificationRead(notifId, env, corsHeaders) {
    await env.DB.prepare(
        'UPDATE notifications SET is_read = 1 WHERE id = ?'
    ).bind(notifId).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function markAllNotificationsRead(userId, env, corsHeaders) {
    await env.DB.prepare(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
    ).bind(userId).run();
    
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// =============================================
// REPORTS
// =============================================
async function getReports(period, env, corsHeaders) {
    let dateCondition = '';
    let isSingleDay = false;
    
    // Obsługa customowych dat
    if (period.includes('-')) {
        if (period.length === 7) { // YYYY-MM (Miesiąc)
            dateCondition = `AND strftime('%Y-%m', t.scheduled_date) = '${period}'`;
        } else { // YYYY-MM-DD (Dzień)
            dateCondition = `AND t.scheduled_date = '${period}'`;
            isSingleDay = true;
        }
    } else if (period === 'week') {
        dateCondition = `AND t.scheduled_date >= date('now', '-7 days')`;
    } else if (period === 'today') { // Dziś
        dateCondition = `AND t.scheduled_date = date('now')`;
        isSingleDay = true;
    }
    
    const drivers = await env.DB.prepare(`
        SELECT id, name, work_start, work_end 
        FROM users WHERE role = 'driver' AND active = 1
    `).all();

    const driversStats = [];

    for (const driver of drivers.results) {
        // Pobierz zadania
        const tasks = await env.DB.prepare(`
            SELECT t.id, t.description, t.status, t.started_at, t.completed_at, t.scheduled_date
            FROM tasks t LEFT JOIN task_drivers td ON t.id = td.task_id
            WHERE (t.assigned_to = ? OR td.user_id = ?) ${dateCondition}
            AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
            ORDER BY t.started_at
        `).bind(driver.id, driver.id).all();

        // Pobierz przestoje
        const delays = await env.DB.prepare(`
            SELECT delay_minutes, created_at FROM task_logs tl
            LEFT JOIN tasks t ON tl.task_id = t.id
            WHERE tl.user_id = ? AND tl.log_type = 'delay' ${dateCondition}
        `).bind(driver.id).all();

        let workMinutes = 0;
        let delayMinutes = 0;
        
        // Dane do wykresu
        let timeline = [];
        
        if (isSingleDay) {
            // Timeline godzinowy (jak teraz)
            timeline = tasks.results.map(t => ({
                type: 'work',
                start: t.started_at,
                end: t.completed_at,
                desc: t.description
            }));
        } else {
            // Wykres słupkowy (dni)
            // Grupuj po dacie
            const dailyStats = {};
            
            tasks.results.forEach(t => {
                const date = t.scheduled_date;
                if (!dailyStats[date]) dailyStats[date] = 0;
                
                const start = new Date(t.started_at);
                const end = new Date(t.completed_at);
                const minutes = (end - start) / 1000 / 60;
                dailyStats[date] += minutes;
            });

            // Konwertuj na format dla frontendu
            timeline = Object.keys(dailyStats).sort().map(date => ({
                type: 'bar',
                date: date,
                minutes: Math.round(dailyStats[date]),
                percent: Math.min(100, Math.round((dailyStats[date] / 480) * 100)) // % z 8h
            }));
        }

        // Sumy ogólne
        tasks.results.forEach(t => {
            const start = new Date(t.started_at);
            const end = new Date(t.completed_at);
            workMinutes += Math.max(0, (end - start) / 1000 / 60);
        });

        delays.results.forEach(d => delayMinutes += (d.delay_minutes || 0));

        // KPI
        let targetMinutes = 0;
        
        if (isSingleDay) {
            const [startH, startM] = (driver.work_start || '07:00').split(':');
            const [endH, endM] = (driver.work_end || '15:00').split(':');
            targetMinutes = Math.max(0, ((parseInt(endH) * 60 + parseInt(endM)) - (parseInt(startH) * 60 + parseInt(startM))) - 20);
        } else {
            // Dla okresu: liczba dni aktywnych * (8h - 20min)
            // Uproszczenie: KPI liczymy tylko dla dni w których była praca
            const activeDays = new Set(tasks.results.map(t => t.scheduled_date)).size;
            targetMinutes = activeDays * (480 - 20); 
        }
        
        const efficiency = targetMinutes > 0 ? Math.min(100, Math.round((workMinutes / targetMinutes) * 100)) : 0;

        driversStats.push({
            id: driver.id,
            name: driver.name,
            tasksCount: tasks.results.length,
            workTime: Math.round(workMinutes),
            delayTime: Math.round(delayMinutes),
            kpi: efficiency,
            isSingleDay: isSingleDay, // Flaga dla frontendu
            timeline: timeline
        });
    }
    
    driversStats.sort((a, b) => b.kpi - a.kpi);
    return new Response(JSON.stringify({ drivers: driversStats }), { headers: corsHeaders });
}