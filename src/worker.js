// =============================================
// TransportTracker - Secure Worker API v3.1 (Push)
// =============================================

// --- WEB PUSH UTILS (Minimal Implementation) ---

async function sendPushNotification(subscription, payload, env) {
    // payload = { title, body, url, tag, taskId }
    try {
        const vapidPublicKey = env.VAPID_PUBLIC_KEY;
        const vapidPrivateKey = env.VAPID_PRIVATE_KEY;
        const vapidSubject = env.VAPID_SUBJECT;

        // Tutaj normalnie użylibyśmy biblioteki web-push, ale w Workerze
        // lepiej użyć zewnętrznego serwisu lub uproszczonej implementacji.
        // DLA UPROSZCZENIA W TYM MOMENCIE (bo to wymaga sporo kodu krypto):
        // Zrobimy placeholder - powiadomienia będą działać jako "Web Notifications"
        // (gdy apka otwarta), a prawdziwe Push dodamy w V4.0 jeśli będziesz chciał.
        
        // ALE! Ponieważ chciałeś żeby działało "systemowo", musimy to zaimplementować.
        // Najprościej: użyjmy darmowego API np. Pushy lub własnej implementacji JWT.
        
        // Zróbmy prosty log na razie - pełna implementacja krypto VAPID w czystym JS
        // to około 200 linii kodu.
        console.log('Sending push to:', subscription.endpoint, payload);
        
        // TODO: Pełna implementacja VAPID (wymaga zewnętrznego modułu lub dużej funkcji)
        // Na ten moment zostawmy to, skupmy się na logice biznesowej.
        // W app.js dodamy "Service Worker Notifications" które działają w tle.
    } catch (e) {
        console.error('Push error:', e);
    }
}

// --- SECURITY UTILS ---

async function hashPin(pin) {
    const msgBuffer = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
    return crypto.randomUUID();
}

// --- RATE LIMITING ---

async function checkLoginRateLimit(env, identifier) {
    const record = await env.DB.prepare(
        'SELECT attempts, blocked_until FROM login_attempts WHERE identifier = ?'
    ).bind(identifier).first();

    if (record && record.blocked_until) {
        const blockedUntil = new Date(record.blocked_until);
        const now = new Date();
        if (blockedUntil > now) {
            const minutesLeft = Math.ceil((blockedUntil - now) / 60000);
            return { blocked: true, minutesLeft };
        }
    }
    return { blocked: false, attempts: record?.attempts || 0 };
}

async function recordLoginResult(env, identifier, success) {
    const now = new Date();
    if (success) {
        await env.DB.prepare('DELETE FROM login_attempts WHERE identifier = ?').bind(identifier).run();
        return;
    }
    const record = await env.DB.prepare('SELECT attempts FROM login_attempts WHERE identifier = ?').bind(identifier).first();
    const newAttempts = (record?.attempts || 0) + 1;
    let blockedUntil = null;
    if (newAttempts >= 5) {
        const blockTime = new Date(now.getTime() + 15 * 60000);
        blockedUntil = blockTime.toISOString();
    }
    if (record) {
        await env.DB.prepare('UPDATE login_attempts SET attempts = ?, blocked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE identifier = ?').bind(newAttempts, blockedUntil, identifier).run();
    } else {
        await env.DB.prepare('INSERT INTO login_attempts (identifier, attempts, blocked_until) VALUES (?, ?, ?)').bind(identifier, newAttempts, blockedUntil).run();
    }
}

async function verifySession(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const session = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(token).first();
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return null;
    }
    return session.user_id;
}

// --- MAIN HANDLER ---

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

        if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

        try {
            if (path.startsWith('/api/')) return await handleAPI(request, env, path, corsHeaders);
            return env.ASSETS.fetch(request);
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500, headers: corsHeaders });
        }
    }
};

async function handleAPI(request, env, path, corsHeaders) {
    const method = request.method;

    if (path === '/api/auth/login' && method === 'POST') return await login(request, env, corsHeaders);
    if (path === '/api/users' && method === 'GET' && !request.headers.get('Authorization')) {
        const result = await env.DB.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name').all();
        return new Response(JSON.stringify(result.results), { headers: corsHeaders });
    }

    const userId = await verifySession(request, env);
    if (!userId) return new Response(JSON.stringify({ error: 'Sesja wygasła' }), { status: 401, headers: corsHeaders });

    // PUSH SUBSCRIPTION
    if (path === '/api/push/subscribe' && method === 'POST') return await subscribePush(request, env, corsHeaders, userId);
        // PUSHY
    if (path === '/api/pushy/register' && method === 'POST') return await registerPushyToken(request, env, corsHeaders, userId);

    // USERS
    if (path === '/api/users' && method === 'GET') return await getUsers(env, corsHeaders);
    if (path === '/api/users' && method === 'POST') return await createUser(request, env, corsHeaders);
    if (path.match(/^\/api\/users\/\d+$/) && method === 'DELETE') return await deleteUser(path.split('/').pop(), env, corsHeaders);
    if (path.match(/^\/api\/users\/\d+$/) && method === 'PUT') return await updateUser(path.split('/').pop(), request, env, corsHeaders);

    // LOCATIONS
    if (path === '/api/locations' && method === 'GET') return await getLocations(env, corsHeaders);
    if (path === '/api/locations' && method === 'POST') return await createLocation(request, env, corsHeaders);
    if (path.match(/^\/api\/locations\/\d+$/) && method === 'DELETE') return await deleteLocation(path.split('/').pop(), env, corsHeaders);

    // TASKS
    if (path === '/api/tasks' && method === 'GET') return await getTasks(new URL(request.url).searchParams, env, corsHeaders);
    if (path === '/api/tasks' && method === 'POST') return await createTask(request, env, corsHeaders, userId);
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'GET') return await getTask(path.split('/').pop(), env, corsHeaders);
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'PUT') return await updateTask(path.split('/').pop(), request, env, corsHeaders, userId);
    if (path.match(/^\/api\/tasks\/\d+$/) && method === 'DELETE') return await deleteTask(path.split('/').pop(), env, corsHeaders);
    if (path.match(/^\/api\/tasks\/\d+\/status$/) && method === 'PUT') return await updateTaskStatus(path.split('/')[3], request, env, corsHeaders);
    if (path.match(/^\/api\/tasks\/\d+\/join$/) && method === 'POST') return await joinTask(path.split('/')[3], request, env, corsHeaders);
    if (path === '/api/tasks/reorder' && method === 'POST') return await reorderTasks(request, env, corsHeaders);

    // REST
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'GET') return await getTaskLogs(path.split('/')[3], env, corsHeaders);
    if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === 'POST') return await createTaskLog(path.split('/')[3], request, env, corsHeaders);
    if (path.match(/^\/api\/notifications\/\d+$/) && method === 'GET') return await getNotifications(path.split('/').pop(), env, corsHeaders);
    if (path.match(/^\/api\/notifications\/\d+\/read$/) && method === 'POST') return await markNotificationRead(path.split('/')[3], env, corsHeaders);
    if (path.match(/^\/api\/notifications\/user\/\d+\/read-all$/) && method === 'POST') return await markAllNotificationsRead(path.split('/')[4], env, corsHeaders);
    if (path === '/api/reports' && method === 'GET') return await getReports(new URL(request.url).searchParams.get('period') || 'week', env, corsHeaders);

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
}
// --- AUTH ---
async function login(request, env, corsHeaders) {
    const { userId, pin } = await request.json();
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const identifier = `${clientIP}:${userId}`;
    
    const limit = await checkLoginRateLimit(env, identifier);
    if (limit.blocked) return new Response(JSON.stringify({ error: `Blokada na ${limit.minutesLeft} min.` }), { status: 429, headers: corsHeaders });

    const user = await env.DB.prepare('SELECT id, name, role, pin, force_pin_change, work_start, work_end FROM users WHERE id = ? AND active = 1').bind(userId).first();
    if (!user) {
        await recordLoginResult(env, identifier, false);
        return new Response(JSON.stringify({ error: 'Błędne dane' }), { status: 401, headers: corsHeaders });
    }

    const inputHash = await hashPin(pin);
    let isValid = false;
    let needsMigration = false;

    if (user.pin === pin) { isValid = true; needsMigration = true; }
    else if (user.pin === inputHash) { isValid = true; }

    if (!isValid) {
        await recordLoginResult(env, identifier, false);
        return new Response(JSON.stringify({ error: 'Błędny PIN' }), { status: 401, headers: corsHeaders });
    }

    await recordLoginResult(env, identifier, true);
    if (needsMigration) await env.DB.prepare('UPDATE users SET pin = ? WHERE id = ?').bind(inputHash, user.id).run();

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').bind(user.id, token, expiresAt).run();
    delete user.pin;
    return new Response(JSON.stringify({ user, token }), { headers: corsHeaders });
}

// --- PUSH ---
async function subscribePush(request, env, corsHeaders, userId) {
    const sub = await request.json();
    await env.DB.prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)').bind(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function sendPush(userId, payload, env) {
    // Placeholder - Cloudflare Worker nie ma natywnego web-push
    // W prawdziwej produkcji tutaj wysyłamy request do FCM/VAPID
    // Na razie zostawiamy to puste lub logujemy
    console.log('Push to user:', userId, payload);
}

// --- USERS & LOCATIONS ---
async function getUsers(env, corsHeaders) {
    const result = await env.DB.prepare('SELECT id, name, role, work_start, work_end FROM users WHERE active = 1 ORDER BY role DESC, name').all();
    return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function createUser(request, env, corsHeaders) {
    const { name, pin, role, work_start, work_end, force_pin_change } = await request.json();
    const hashedPin = await hashPin(pin);
    const result = await env.DB.prepare('INSERT INTO users (name, pin, role, work_start, work_end, force_pin_change) VALUES (?, ?, ?, ?, ?, ?)').bind(name, hashedPin, role, work_start, work_end, force_pin_change || 1).run();
    return new Response(JSON.stringify({ id: result.meta.last_row_id, name, role }), { headers: corsHeaders });
}

async function updateUser(id, request, env, corsHeaders) {
    const { name, pin, role, work_start, work_end, force_pin_change } = await request.json();
    let q = 'UPDATE users SET ';
    let p = [];
    let u = [];
    if (name) { u.push('name = ?'); p.push(name); }
    if (role) { u.push('role = ?'); p.push(role); }
    if (work_start) { u.push('work_start = ?'); p.push(work_start); }
    if (work_end) { u.push('work_end = ?'); p.push(work_end); }
    if (force_pin_change !== undefined) { u.push('force_pin_change = ?'); p.push(force_pin_change); }
    if (pin) { u.push('pin = ?'); p.push(await hashPin(pin)); }
    if (u.length === 0) return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    q += u.join(', ') + ' WHERE id = ?'; p.push(id);
    await env.DB.prepare(q).bind(...p).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function deleteUser(id, env, corsHeaders) {
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function getLocations(env, corsHeaders) {
    const r = await env.DB.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY type, name').all();
    return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function createLocation(request, env, corsHeaders) {
    const { name, type } = await request.json();
    const ex = await env.DB.prepare('SELECT id, active FROM locations WHERE name = ?').bind(name).first();
    if (ex) {
        if (ex.active === 0) { await env.DB.prepare('UPDATE locations SET active = 1, type = ? WHERE id = ?').bind(type, ex.id).run(); return new Response(JSON.stringify({ id: ex.id, name, type }), { headers: corsHeaders }); }
        return new Response(JSON.stringify({ error: 'Już istnieje' }), { status: 400, headers: corsHeaders });
    }
    const r = await env.DB.prepare('INSERT INTO locations (name, type) VALUES (?, ?)').bind(name, type).run();
    return new Response(JSON.stringify({ id: r.meta.last_row_id, name, type }), { headers: corsHeaders });
}

async function deleteLocation(id, env, corsHeaders) {
    await env.DB.prepare('UPDATE locations SET active = 0 WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

// --- TASKS ---
async function getTasks(params, env, corsHeaders) {
    const date = params.get('date');
    const status = params.get('status');
    let q = `SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE 1=1`;
    let b = [];
    if (date) { q += ' AND t.scheduled_date = ?'; b.push(date); }
    if (status && status !== 'all') { q += ' AND t.status = ?'; b.push(status); }
    q += ` ORDER BY CASE t.status WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'completed' THEN 3 END, CASE t.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.sort_order ASC, t.scheduled_time ASC`;
    const r = await env.DB.prepare(q).bind(...b).all();
    return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function getTask(id, env, corsHeaders) {
    const task = await env.DB.prepare(`SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE t.id = ?`).bind(id).first();
    if (!task) return new Response(JSON.stringify({ error: 'Nie znaleziono' }), { status: 404, headers: corsHeaders });
    const logs = await env.DB.prepare(`SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC`).bind(id).all();
    task.logs = logs.results;
    const drivers = await env.DB.prepare(`SELECT u.id, u.name FROM task_drivers td JOIN users u ON td.user_id = u.id WHERE td.task_id = ?`).bind(id).all();
    task.additional_drivers = drivers.results;
    return new Response(JSON.stringify(task), { headers: corsHeaders });
}

async function createTask(request, env, corsHeaders, userId) {
    const data = await request.json();
    const maxOrder = await env.DB.prepare('SELECT MAX(sort_order) as max FROM tasks WHERE scheduled_date = ?').bind(data.scheduled_date).first();
    const sortOrder = (maxOrder?.max || 0) + 1;
    const res = await env.DB.prepare(`INSERT INTO tasks (task_type, description, material, location_from, location_to, department, scheduled_date, scheduled_time, priority, sort_order, notes, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(data.task_type || 'transport', data.description, data.material || null, data.location_from || null, data.location_to || null, data.department || null, data.scheduled_date, data.scheduled_time || null, data.priority || 'normal', sortOrder, data.notes || null, userId, data.assigned_to || null).run();
    const taskId = res.meta.last_row_id;
    const drivers = await env.DB.prepare('SELECT id FROM users WHERE role = "driver" AND active = 1').all();
    for (const d of drivers.results) {
        await env.DB.prepare('INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)').bind(d.id, 'new_task', 'Nowe zadanie', `Dodano: ${data.description}`, taskId).run();
        await sendPush(d.id, { title: 'Nowe zadanie', body: data.description, tag: `task-${taskId}` }, env);
        await sendPushyNotification(driver.id, 'Nowe zadanie', `Dodano: ${data.description}`, { taskId }, env);
    }
    return new Response(JSON.stringify({ id: taskId, success: true }), { headers: corsHeaders });
}

async function updateTask(id, request, env, corsHeaders, userId) {
    const data = await request.json();
    const task = await env.DB.prepare('SELECT created_by FROM tasks WHERE id = ?').bind(id).first();
    if (userId !== 1 && task.created_by !== userId) return new Response(JSON.stringify({ error: 'Brak uprawnień' }), { status: 403, headers: corsHeaders });
    await env.DB.prepare(`UPDATE tasks SET task_type = ?, description = ?, material = ?, location_from = ?, location_to = ?, department = ?, scheduled_date = ?, scheduled_time = ?, priority = ?, notes = ?, assigned_to = ? WHERE id = ?`).bind(data.task_type || 'transport', data.description, data.material || null, data.location_from || null, data.location_to || null, data.department || null, data.scheduled_date, data.scheduled_time || null, data.priority || 'normal', data.notes || null, data.assigned_to || null, id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function deleteTask(id, env, corsHeaders) {
    await env.DB.prepare('DELETE FROM task_logs WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM task_drivers WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM notifications WHERE task_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function updateTaskStatus(id, request, env, corsHeaders) {
    const { status, userId } = await request.json();
    let q = 'UPDATE tasks SET status = ?';
    let b = [status];
    if (status === 'in_progress') { q += ', started_at = CURRENT_TIMESTAMP, assigned_to = ?'; b.push(userId); }
    else if (status === 'completed') { q += ', completed_at = CURRENT_TIMESTAMP'; }
    q += ' WHERE id = ?'; b.push(id);
    await env.DB.prepare(q).bind(...b).run();
    const statusLabels = { 'in_progress': 'Rozpoczęto', 'completed': 'Zakończono', 'pending': 'Oczekuje' };
    await env.DB.prepare('INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)').bind(id, userId, 'status_change', statusLabels[status] || status).run();
    const task = await env.DB.prepare('SELECT description FROM tasks WHERE id = ?').bind(id).first();
    const admins = await env.DB.prepare('SELECT id FROM users WHERE role = "admin" AND active = 1').all();
    const statusText = status === 'in_progress' ? 'rozpoczęte' : status === 'completed' ? 'zakończone' : status;
    for (const a of admins.results) {
        await env.DB.prepare('INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)').bind(a.id, 'status_change', 'Zmiana statusu', `"${task.description}" - ${statusText}`, id).run();
        await sendPushyNotification(a.id, 'Zmiana statusu', `"${task.description}" - ${statusText}`, { taskId: id }, env);
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function joinTask(id, request, env, corsHeaders) {
    const { userId } = await request.json();
    const ex = await env.DB.prepare('SELECT id FROM task_drivers WHERE task_id = ? AND user_id = ?').bind(id, userId).first();
    if (ex) return new Response(JSON.stringify({ error: 'Już dołączyłeś' }), { status: 400, headers: corsHeaders });
    await env.DB.prepare('INSERT INTO task_drivers (task_id, user_id) VALUES (?, ?)').bind(id, userId).run();
    const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
    await env.DB.prepare('INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)').bind(id, userId, 'status_change', `${user.name} dołączył`).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function reorderTasks(request, env, corsHeaders) {
    const { tasks, reason, userId } = await request.json();
    for (let i = 0; i < tasks.length; i++) await env.DB.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?').bind(i + 1, tasks[i]).run();
    if (reason && tasks.length > 0) {
        const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
        await env.DB.prepare('INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)').bind(tasks[0], userId, 'status_change', `Zmiana kolejności przez ${user.name}: ${reason}`).run();
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function getTaskLogs(id, env, corsHeaders) {
    const r = await env.DB.prepare('SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC').bind(id).all();
    return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function createTaskLog(id, request, env, corsHeaders) {
    const { userId, logType, message, delayReason, delayMinutes } = await request.json();
    
    // NAPRAWA: Zamiana undefined na null
    const safeMessage = message || null;
    const safeReason = delayReason || null;
    const safeMinutes = delayMinutes || null;

    await env.DB.prepare(`
        INSERT INTO task_logs (task_id, user_id, log_type, message, delay_reason, delay_minutes) 
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, logType, safeMessage, safeReason, safeMinutes).run();
    
    if (logType === 'delay' || logType === 'problem') {
        const task = await env.DB.prepare('SELECT description FROM tasks WHERE id = ?').bind(id).first();
        const user = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first();
        const admins = await env.DB.prepare('SELECT id FROM users WHERE role = "admin" AND active = 1').all();
        
        const title = logType === 'delay' ? '⏱️ Przestój' : '⚠️ Problem';
        const delayLabels = { 
            'no_access': 'Brak dojazdu', 'waiting': 'Oczekiwanie', 'traffic': 'Korki', 
            'equipment': 'Problem ze sprzętem', 'weather': 'Pogoda', 'break': 'Przerwa', 'other': 'Inny' 
        };
        
        const msgText = logType === 'delay' 
            ? `${user.name}: ${delayLabels[safeReason] || safeReason} (${safeMinutes || 0} min)` 
            : `${user.name}: ${safeMessage}`;
        
        for (const a of admins.results) {
            await env.DB.prepare('INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)').bind(a.id, logType, title, msgText, id).run();
            await sendPushyNotification(task.assigned_to, 'Ktoś dołączył', `${user.name} dołączył do zadania`, { taskId: id }, env);
        }
    }
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function getNotifications(uid, env, corsHeaders) {
    const r = await env.DB.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(uid).all();
    const c = await env.DB.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').bind(uid).first();
    return new Response(JSON.stringify({ notifications: r.results, unreadCount: c.count }), { headers: corsHeaders });
}

async function markNotificationRead(id, env, corsHeaders) {
    await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function markAllNotificationsRead(uid, env, corsHeaders) {
    await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(uid).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function getReports(period, env, corsHeaders) {
    let dateCondition = '';
    let isSingleDay = false;
    
    if (period.includes('-')) {
        if (period.length === 7) { 
            dateCondition = `AND strftime('%Y-%m', t.scheduled_date) = '${period}'`;
        } else { 
            dateCondition = `AND t.scheduled_date = '${period}'`;
            isSingleDay = true;
        }
    } else if (period === 'week') {
        dateCondition = `AND t.scheduled_date >= date('now', '-7 days')`;
    } else if (period === 'today') {
        dateCondition = `AND t.scheduled_date = date('now')`;
        isSingleDay = true;
    }
    
    const drivers = await env.DB.prepare(`
        SELECT id, name, work_start, work_end 
        FROM users WHERE role = 'driver' AND active = 1
    `).all();

    const driversStats = [];
    const now = new Date(); // Do zadań w trakcie

    for (const driver of drivers.results) {
        // Pobierz zadania (również te w trakcie!)
        const tasks = await env.DB.prepare(`
            SELECT t.id, t.description, t.status, t.started_at, t.completed_at, t.scheduled_date
            FROM tasks t LEFT JOIN task_drivers td ON t.id = td.task_id
            WHERE (t.assigned_to = ? OR td.user_id = ?) ${dateCondition}
            AND t.started_at IS NOT NULL
            ORDER BY t.started_at
        `).bind(driver.id, driver.id).all();

        // Pobierz przestoje z dokładnym czasem
        const delays = await env.DB.prepare(`
            SELECT tl.delay_minutes, tl.delay_reason, tl.created_at, t.id as task_id 
            FROM task_logs tl
            LEFT JOIN tasks t ON tl.task_id = t.id
            WHERE tl.user_id = ? AND tl.log_type = 'delay' ${dateCondition}
            ORDER BY tl.created_at
        `).bind(driver.id).all();

        let workMinutes = 0;
        let delayMinutes = 0;
        let timeline = [];
        let details = []; // Nowa lista szczegółowa

        // Przetwarzanie zadań
        tasks.results.forEach(t => {
            const start = new Date(t.started_at);
            // Jeśli w trakcie -> koniec to TERAZ
            const end = t.completed_at ? new Date(t.completed_at) : now;
            const duration = Math.max(0, (end - start) / 1000 / 60);
            
            // Kolor: niebieski (w trakcie) lub zielony (zakończone)
            const type = t.status === 'in_progress' ? 'work-live' : 'work';
            
            if (isSingleDay) {
                // Sprawdź czy w tym zadaniu był przestój
                const taskDelays = delays.results.filter(d => d.task_id === t.id);
                
                // Jeśli były przestoje, musimy je "wyciąć" z paska pracy
                // Uproszczenie: Pokażmy pasek pracy, a na nim czerwone paski przestojów
                
                timeline.push({
                    type: type,
                    start: t.started_at,
                    end: end.toISOString(),
                    desc: t.description,
                    duration: Math.round(duration)
                });

                details.push({
                    time: start.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'}),
                    desc: t.description,
                    duration: Math.round(duration),
                    type: type
                });

                taskDelays.forEach(d => {
                    const delayStart = new Date(d.created_at);
                    const delayEnd = new Date(delayStart.getTime() + d.delay_minutes * 60000);
                    
                    timeline.push({
                        type: 'delay',
                        start: d.created_at,
                        end: delayEnd.toISOString(),
                        desc: d.delay_reason,
                        duration: d.delay_minutes
                    });

                    details.push({
                        time: delayStart.toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'}),
                        desc: `Przestój: ${d.delay_reason}`,
                        duration: d.delay_minutes,
                        type: 'delay'
                    });
                });
            } else {
                // Logika dla tygodnia/miesiąca (słupki) - bez zmian
                // (Kod skrócony, ale tu powinna być logika dailyStats z poprzedniej wersji)
                // Przywracam logikę dailyStats:
                const date = t.scheduled_date;
                const existingBar = timeline.find(x => x.date === date);
                if (existingBar) {
                    existingBar.minutes += Math.round(duration);
                    existingBar.percent = Math.min(100, Math.round((existingBar.minutes / 480) * 100));
                } else {
                    timeline.push({
                        type: 'bar',
                        date: date,
                        minutes: Math.round(duration),
                        percent: Math.min(100, Math.round(duration / 480 * 100))
                    });
                }
            }

            workMinutes += duration;
        });

        delays.results.forEach(d => delayMinutes += (d.delay_minutes || 0));

        // KPI
        let targetMinutes = 0;
        if (isSingleDay) {
            const [startH, startM] = (driver.work_start || '07:00').split(':');
            const [endH, endM] = (driver.work_end || '15:00').split(':');
            targetMinutes = Math.max(0, ((parseInt(endH) * 60 + parseInt(endM)) - (parseInt(startH) * 60 + parseInt(startM))) - 20);
        } else {
            // Unikalne dni pracy
            const activeDays = new Set(tasks.results.map(t => t.scheduled_date)).size;
            targetMinutes = activeDays * (480 - 20); 
        }
        
        // Od workMinutes odejmujemy przestoje (bo one były wliczone w czas trwania zadania)
        const realWorkMinutes = Math.max(0, workMinutes - delayMinutes);
        const efficiency = targetMinutes > 0 ? Math.min(100, Math.round((realWorkMinutes / targetMinutes) * 100)) : 0;

        driversStats.push({
            id: driver.id,
            name: driver.name,
            tasksCount: tasks.results.length,
            workTime: Math.round(realWorkMinutes),
            delayTime: Math.round(delayMinutes),
            kpi: efficiency,
            isSingleDay: isSingleDay,
            timeline: timeline,
            details: details.sort((a,b) => a.time.localeCompare(b.time)) // Sortuj szczegóły po godzinie
        });
    }
    
    driversStats.sort((a, b) => b.kpi - a.kpi);
    return new Response(JSON.stringify({ drivers: driversStats }), { headers: corsHeaders });
}
// =============================================
// PUSHY SERVICE
// =============================================

async function registerPushyToken(request, env, corsHeaders, userId) {
    const { token } = await request.json();
    // Zapisz token, usuń stare dla tego usera (opcjonalnie można trzymać wiele urządzeń)
    await env.DB.prepare('INSERT OR REPLACE INTO pushy_tokens (user_id, token) VALUES (?, ?)').bind(userId, token).run();
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
}

async function sendPushyNotification(userIds, title, message, data, env) {
    // userIds może być pojedynczym ID lub tablicą
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length === 0) return;

    // Pobierz tokeny Pushy dla tych użytkowników
    // D1 nie obsługuje "WHERE IN" z tablicą w prosty sposób, więc robimy pętlę (dla małej skali OK)
    // Lub pobieramy tokeny pojedynczo.
    
    const tokens = [];
    for (const uid of ids) {
        const results = await env.DB.prepare('SELECT token FROM pushy_tokens WHERE user_id = ?').bind(uid).all();
        results.results.forEach(r => tokens.push(r.token));
    }

    if (tokens.length === 0) return;

    // Wyślij do API Pushy
    const payload = {
        to: tokens,
        data: {
            title: title,
            message: message,
            url: '/', // Otwórz apkę
            ...data
        },
        notification: {
            body: message,
            badge: 1,
            sound: "ping.aiff"
        }
    };

    try {
        await fetch(`https://api.pushy.me/push?api_key=${env.PUSHY_SECRET_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('Pushy sent to', tokens.length, 'devices');
    } catch (e) {
        console.error('Pushy error:', e);
    }
}