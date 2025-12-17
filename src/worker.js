// =============================================
// TransportTracker - Cloudflare Worker API
// =============================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json'
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Routing API
            if (path.startsWith('/api/')) {
                return await handleAPI(request, env, path, corsHeaders);
            }

            // Serve static files
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
// API Router
// =============================================
async function handleAPI(request, env, path, corsHeaders) {
    const method = request.method;

    // === AUTH ===
    if (path === '/api/users' && method === 'GET') {
        return await getUsers(env, corsHeaders);
    }
    if (path === '/api/auth/login' && method === 'POST') {
        return await login(request, env, corsHeaders);
    }

    // === USERS ===
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

    // === LOCATIONS ===
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

    // === TASKS ===
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
    if (path === '/api/tasks/reorder' && method === 'POST') {
        return await reorderTasks(request, env, corsHeaders);
    }

    // === TASK LOGS ===
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'GET') {
        const taskId = path.split('/')[3];
        return await getTaskLogs(taskId, env, corsHeaders);
    }
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'POST') {
        const taskId = path.split('/')[3];
        return await createTaskLog(taskId, request, env, corsHeaders);
    }

    // === NOTIFICATIONS ===
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

    return new Response(
        JSON.stringify({ error: 'Not Found' }),
        { status: 404, headers: corsHeaders }
    );
}

// =============================================
// AUTH Functions
// =============================================
async function getUsers(env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name'
    ).all();
    
    return new Response(
        JSON.stringify(result.results),
        { headers: corsHeaders }
    );
}

async function login(request, env, corsHeaders) {
    const { userId, pin } = await request.json();
    
    const user = await env.DB.prepare(
        'SELECT id, name, role FROM users WHERE id = ? AND pin = ? AND active = 1'
    ).bind(userId, pin).first();
    
    if (!user) {
        return new Response(
            JSON.stringify({ error: 'Nieprawidłowy PIN' }),
            { status: 401, headers: corsHeaders }
        );
    }
    
    return new Response(
        JSON.stringify({ user }),
        { headers: corsHeaders }
    );
}

// =============================================
// USER Functions
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
        'INSERT INTO users (name, pin, role) VALUES (?, ?, ?)'
    ).bind(name, pin, role).run();
    
    return new Response(
        JSON.stringify({ id: result.meta.last_row_id, name, role }),
        { headers: corsHeaders }
    );
}

async function updateUser(id, request, env, corsHeaders) {
    const { name, pin, role } = await request.json();
    
    let query = 'UPDATE users SET name = ?, role = ?';
    let params = [name, role];
    
    if (pin) {
        query += ', pin = ?';
        params.push(pin);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    await env.DB.prepare(query).bind(...params).run();
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

async function deleteUser(id, env, corsHeaders) {
    await env.DB.prepare(
        'UPDATE users SET active = 0 WHERE id = ?'
    ).bind(id).run();
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

// =============================================
// LOCATION Functions
// =============================================
async function getLocations(env, corsHeaders) {
    const result = await env.DB.prepare(
        'SELECT * FROM locations WHERE active = 1 ORDER BY type, name'
    ).all();
    
    return new Response(
        JSON.stringify(result.results),
        { headers: corsHeaders }
    );
}

async function createLocation(request, env, corsHeaders) {
    const { name, type = 'location' } = await request.json();
    
    if (!name) {
        return new Response(
            JSON.stringify({ error: 'Nazwa jest wymagana' }),
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
    await env.DB.prepare(
        'UPDATE locations SET active = 0 WHERE id = ?'
    ).bind(id).run();
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

// =============================================
// TASK Functions
// =============================================
async function getTasks(params, env, corsHeaders) {
    const date = params.get('date');
    const status = params.get('status');
    const userId = params.get('userId');
    
    let query = `
        SELECT t.*, u.name as assigned_name, c.name as creator_name
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
    
    if (userId) {
        query += ' AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
        bindings.push(userId);
    }
    
    query += ' ORDER BY t.sort_order ASC, CASE t.priority WHEN "high" THEN 1 WHEN "normal" THEN 2 WHEN "low" THEN 3 END, t.scheduled_time ASC';
    
    const result = await env.DB.prepare(query).bind(...bindings).all();
    
    return new Response(
        JSON.stringify(result.results),
        { headers: corsHeaders }
    );
}

async function getTask(id, env, corsHeaders) {
    const task = await env.DB.prepare(`
        SELECT t.*, u.name as assigned_name, c.name as creator_name
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
    
    // Get logs
    const logs = await env.DB.prepare(`
        SELECT tl.*, u.name as user_name
        FROM task_logs tl
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE tl.task_id = ?
        ORDER BY tl.created_at DESC
    `).bind(id).all();
    
    task.logs = logs.results;
    
    return new Response(
        JSON.stringify(task),
        { headers: corsHeaders }
    );
}

async function createTask(request, env, corsHeaders) {
    const data = await request.json();
    
    // Get max sort_order for this date
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
    
    // Create notification for assigned driver
    if (data.assigned_to) {
        await env.DB.prepare(`
            INSERT INTO notifications (user_id, type, title, message, task_id)
            VALUES (?, 'new_task', 'Nowe zadanie', ?, ?)
        `).bind(
            data.assigned_to,
            `Przydzielono Ci nowe zadanie: ${data.description}`,
            result.meta.last_row_id
        ).run();
    }
    
    // Notify all drivers about new task
    const drivers = await env.DB.prepare(
        'SELECT id FROM users WHERE role = "driver" AND active = 1'
    ).all();
    
    for (const driver of drivers.results) {
        if (driver.id !== data.assigned_to) {
            await env.DB.prepare(`
                INSERT INTO notifications (user_id, type, title, message, task_id)
                VALUES (?, 'new_task', 'Nowe zadanie', ?, ?)
            `).bind(
                driver.id,
                `Dodano nowe zadanie: ${data.description}`,
                result.meta.last_row_id
            ).run();
        }
    }
    
    return new Response(
        JSON.stringify({ id: result.meta.last_row_id, success: true }),
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
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

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
    await env.DB.prepare(`
        INSERT INTO task_logs (task_id, user_id, log_type, message)
        VALUES (?, ?, 'status_change', ?)
    `).bind(id, userId, `Status zmieniony na: ${status}`).run();
    
    // Notify admins about status change
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
            `Zadanie "${task.description}" zostało ${statusText}`,
            id
        ).run();
    }
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

async function deleteTask(id, env, corsHeaders) {
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

async function reorderTasks(request, env, corsHeaders) {
    const { tasks } = await request.json();
    
    for (let i = 0; i < tasks.length; i++) {
        await env.DB.prepare(
            'UPDATE tasks SET sort_order = ? WHERE id = ?'
        ).bind(i + 1, tasks[i]).run();
    }
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

// =============================================
// TASK LOG Functions
// =============================================
async function getTaskLogs(taskId, env, corsHeaders) {
    const result = await env.DB.prepare(`
        SELECT tl.*, u.name as user_name
        FROM task_logs tl
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE tl.task_id = ?
        ORDER BY tl.created_at DESC
    `).bind(taskId).all();
    
    return new Response(
        JSON.stringify(result.results),
        { headers: corsHeaders }
    );
}

async function createTaskLog(taskId, request, env, corsHeaders) {
    const { userId, logType, message, delayReason, delayMinutes } = await request.json();
    
    const result = await env.DB.prepare(`
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
        const admins = await env.DB.prepare(
            'SELECT id FROM users WHERE role = "admin" AND active = 1'
        ).all();
        
        const title = logType === 'delay' ? 'Przestój zgłoszony' : 'Problem zgłoszony';
        
        for (const admin of admins.results) {
            await env.DB.prepare(`
                INSERT INTO notifications (user_id, type, title, message, task_id)
                VALUES (?, ?, ?, ?, ?)
            `).bind(
                admin.id,
                logType,
                title,
                `${task.description}: ${message || delayReason}`,
                taskId
            ).run();
        }
    }
    
    return new Response(
        JSON.stringify({ id: result.meta.last_row_id, success: true }),
        { headers: corsHeaders }
    );
}

// =============================================
// NOTIFICATION Functions
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
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}

async function markAllNotificationsRead(userId, env, corsHeaders) {
    await env.DB.prepare(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
    ).bind(userId).run();
    
    return new Response(
        JSON.stringify({ success: true }),
        { headers: corsHeaders }
    );
}