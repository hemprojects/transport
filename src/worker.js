// =============================================
// TransportTracker - Secure Worker API v3.2
// =============================================

// --- TIMEZONE UTILS (POLAND - Europe/Warsaw) ---

// Konwertuje datę UTC na czas polski (uwzględnia automatycznie DST)
function toPolishTime(utcDate) {
  return new Date(utcDate.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
}

// Zwraca aktualny czas polski
function getPolishNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
}

// Formatuje datę do SQL DATETIME w czasie polskim
function toPolishSQL(date) {
  const polishDate = typeof date === 'string' ? new Date(date) : date;
  const polish = new Date(polishDate.toLocaleString("en-US", { timeZone: "Europe/Warsaw" }));
  
  const year = polish.getFullYear();
  const month = String(polish.getMonth() + 1).padStart(2, '0');
  const day = String(polish.getDate()).padStart(2, '0');
  const hours = String(polish.getHours()).padStart(2, '0');
  const minutes = String(polish.getMinutes()).padStart(2, '0');
  const seconds = String(polish.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Zwraca dzisiejszą datę w Polsce (format YYYY-MM-DD)
function getPolishToday() {
  const now = getPolishNow();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- SECURITY UTILS ---

async function hashPin(pin) {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
  return crypto.randomUUID();
}

// --- TASK MIGRATION ---

// Migruje oczekujące i wstrzymane zadania z poprzednich dni
// Wywoływane codziennie o 18:00 (czas polski) przez cron
async function migratePendingTasks(env) {
  const today = getPolishToday();
  
  console.log(`🔄 Task Migration: Running for ${today}...`);
  
  // Znajdź wszystkie pending i paused z dni poprzednich
  const tasksToMigrate = await env.DB.prepare(
    `SELECT id, scheduled_date, status, description 
     FROM tasks 
     WHERE scheduled_date < ? 
     AND status IN ('pending', 'paused')
     ORDER BY scheduled_date ASC`
  )
    .bind(today)
    .all();
  
  if (!tasksToMigrate.results || tasksToMigrate.results.length === 0) {
    console.log(`✅ Task Migration: No tasks to migrate.`);
    return { migrated: 0 };
  }
  
  console.log(`📋 Task Migration: Found ${tasksToMigrate.results.length} tasks to migrate`);
  
  // Dla każdego zadania: przenieś na dziś + ustaw flagę from_yesterday
  for (const task of tasksToMigrate.results) {
    await env.DB.prepare(
      `UPDATE tasks 
       SET scheduled_date = ?, 
           from_yesterday = 1,
           sort_order = 0
       WHERE id = ?`
    )
      .bind(today, task.id)
      .run();
    
    console.log(`  ✓ Migrated task #${task.id}: "${task.description}" (${task.status})`);
  }
  
  console.log(`✅ Task Migration: Completed. Migrated ${tasksToMigrate.results.length} tasks.`);
  
  return { migrated: tasksToMigrate.results.length };
}

// --- RATE LIMITING ---

async function checkLoginRateLimit(env, identifier) {
  const record = await env.DB.prepare(
    "SELECT attempts, blocked_until FROM login_attempts WHERE identifier = ?"
  )
    .bind(identifier)
    .first();

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
    await env.DB.prepare("DELETE FROM login_attempts WHERE identifier = ?")
      .bind(identifier)
      .run();
    return;
  }
  const record = await env.DB.prepare(
    "SELECT attempts FROM login_attempts WHERE identifier = ?"
  )
    .bind(identifier)
    .first();
  const newAttempts = (record?.attempts || 0) + 1;
  let blockedUntil = null;
  if (newAttempts >= 5) {
    const blockTime = new Date(now.getTime() + 15 * 60000);
    blockedUntil = blockTime.toISOString();
  }
  if (record) {
    await env.DB.prepare(
      "UPDATE login_attempts SET attempts = ?, blocked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE identifier = ?"
    )
      .bind(newAttempts, blockedUntil, identifier)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO login_attempts (identifier, attempts, blocked_until) VALUES (?, ?, ?)"
    )
      .bind(identifier, newAttempts, blockedUntil)
      .run();
  }
}

async function verifySession(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  )
    .bind(token)
    .first();
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?")
      .bind(token)
      .run();
    return null;
  }
  return session.user_id;
}

// --- API HANDLER ---

async function handleAPI(request, env, path, corsHeaders) {
  const method = request.method;

  if (path === "/api/auth/login" && method === "POST")
    return await login(request, env, corsHeaders);
  if (
    path === "/api/users" &&
    method === "GET" &&
    !request.headers.get("Authorization")
  ) {
    const result = await env.DB.prepare(
      "SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name"
    ).all();
    return new Response(JSON.stringify(result.results), {
      headers: corsHeaders,
    });
  }

  const userId = await verifySession(request, env);
  if (!userId)
    return new Response(JSON.stringify({ error: "Sesja wygasła" }), {
      status: 401,
      headers: corsHeaders,
    });

  // PUSHY - Removed
  // if (path === '/api/pushy/register' && method === 'POST') return await registerPushyToken(request, env, corsHeaders, userId);

  // USERS
  if (path === "/api/users" && method === "GET")
    return await getUsers(env, corsHeaders);
  if (path === "/api/users" && method === "POST")
    return await createUser(request, env, corsHeaders);
  if (path.match(/^\/api\/users\/\d+$/) && method === "DELETE")
    return await deleteUser(path.split("/").pop(), env, corsHeaders);
  if (path.match(/^\/api\/users\/\d+$/) && method === "PUT")
    return await updateUser(path.split("/").pop(), request, env, corsHeaders);

  // LOCATIONS
  if (path === "/api/locations" && method === "GET")
    return await getLocations(env, corsHeaders);
  if (path === "/api/locations" && method === "POST")
    return await createLocation(request, env, corsHeaders);
  if (path.match(/^\/api\/locations\/\d+$/) && method === "DELETE")
    return await deleteLocation(path.split("/").pop(), env, corsHeaders);

  // TASKS
  if (path === "/api/tasks" && method === "GET")
    return await getTasks(new URL(request.url).searchParams, env, corsHeaders);
  if (path === "/api/tasks" && method === "POST")
    return await createTask(request, env, corsHeaders, userId);
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "GET")
    return await getTask(path.split("/").pop(), env, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "PUT")
    return await updateTask(
      path.split("/").pop(),
      request,
      env,
      corsHeaders,
      userId
    );
  if (path.match(/^\/api\/tasks\/\d+$/) && method === "DELETE")
    return await deleteTask(path.split("/").pop(), env, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+\/status$/) && method === "PUT")
    return await updateTaskStatus(
      path.split("/")[3],
      request,
      env,
      corsHeaders
    );
  if (path.match(/^\/api\/tasks\/\d+\/join$/) && method === "POST")
    return await joinTask(path.split("/")[3], request, env, corsHeaders);
  if (path === "/api/tasks/reorder" && method === "POST")
    return await reorderTasks(request, env, corsHeaders);

  // LOGS & NOTIFICATIONS
  if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === "GET")
    return await getTaskLogs(path.split("/")[3], env, corsHeaders);
  if (path.match(/^\/api\/tasks\/\d+\/logs$/) && method === "POST")
    return await createTaskLog(path.split("/")[3], request, env, corsHeaders);
  if (path.match(/^\/api\/notifications\/\d+$/) && method === "GET")
    return await getNotifications(path.split("/").pop(), env, corsHeaders);
  if (path.match(/^\/api\/notifications\/\d+\/read$/) && method === "POST")
    return await markNotificationRead(path.split("/")[3], env, corsHeaders);
  if (
    path.match(/^\/api\/notifications\/user\/\d+\/read-all$/) &&
    method === "POST"
  )
    return await markAllNotificationsRead(path.split("/")[4], env, corsHeaders);
  if (
    path.match(/^\/api\/notifications\/user\/\d+\/delete-read$/) &&
    method === "DELETE"
  )
    return await deleteReadNotifications(path.split("/")[4], env, corsHeaders);

  // REPORTS
  if (path === "/api/reports" && method === "GET")
    return await getReports(
      new URL(request.url).searchParams.get("period") || "week",
      env,
      corsHeaders
    );

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: corsHeaders,
  });
}

// --- AUTH ---

async function login(request, env, corsHeaders) {
  const { userId, pin } = await request.json();
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const identifier = `${clientIP}:${userId}`;

  const limit = await checkLoginRateLimit(env, identifier);
  if (limit.blocked)
    return new Response(
      JSON.stringify({ error: `Blokada na ${limit.minutesLeft} min.` }),
      { status: 429, headers: corsHeaders }
    );

  const user = await env.DB.prepare(
  `SELECT 
    id, 
    name, 
    role, 
    pin, 
    force_pin_change, 
    work_start, 
    work_end, 
    COALESCE(perm_users, 1) as perm_users,
    COALESCE(perm_locations, 1) as perm_locations,
    COALESCE(perm_reports, 1) as perm_reports
  FROM users 
  WHERE id = ? AND active = 1`
)
    .bind(userId)
    .first();
  if (!user) {
    await recordLoginResult(env, identifier, false);
    return new Response(JSON.stringify({ error: "Błędne dane" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const inputHash = await hashPin(pin);
  let isValid = false;
  let needsMigration = false;

  if (user.pin === pin) {
    isValid = true;
    needsMigration = true;
  } else if (user.pin === inputHash) {
    isValid = true;
  }

  if (!isValid) {
    await recordLoginResult(env, identifier, false);
    return new Response(JSON.stringify({ error: "Błędny PIN" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  await recordLoginResult(env, identifier, true);
  if (needsMigration)
    await env.DB.prepare("UPDATE users SET pin = ? WHERE id = ?")
      .bind(inputHash, user.id)
      .run();

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
  )
    .bind(user.id, token, expiresAt)
    .run();
  delete user.pin;
  return new Response(JSON.stringify({ user, token }), {
    headers: corsHeaders,
  });
}

// --- USERS ---

async function getUsers(env, corsHeaders) {
  // Pobieramy też uprawnienia
  const result = await env.DB.prepare(
    "SELECT id, name, role, work_start, work_end, perm_users, perm_locations, perm_reports FROM users WHERE active = 1 ORDER BY role DESC, name"
  ).all();
  return new Response(JSON.stringify(result.results), { headers: corsHeaders });
}

async function createUser(request, env, corsHeaders) {
  const {
    name,
    pin,
    role,
    work_start,
    work_end,
    force_pin_change,
    perm_users,
    perm_locations,
    perm_reports,
  } = await request.json();
  
  const hashedPin = await hashPin(pin);

  // Domyślne uprawnienia
  const p_users = perm_users !== undefined ? perm_users : (role === "admin" ? 1 : 0);
  const p_loc = perm_locations !== undefined ? perm_locations : (role === "admin" ? 1 : 0);
  const p_rep = perm_reports !== undefined ? perm_reports : (role === "admin" ? 1 : 0);

  // Godziny pracy - null dla admina, domyślne dla kierowcy
  const workStart = role === "driver" ? (work_start || "07:00") : null;
  const workEnd = role === "driver" ? (work_end || "15:00") : null;

  const result = await env.DB.prepare(
    "INSERT INTO users (name, pin, role, work_start, work_end, force_pin_change, perm_users, perm_locations, perm_reports) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      name,
      hashedPin,
      role,
      workStart,
      workEnd,
      force_pin_change || 1,
      p_users,
      p_loc,
      p_rep
    )
    .run();
    
  return new Response(
    JSON.stringify({ id: result.meta.last_row_id, name, role }),
    { headers: corsHeaders }
  );
}

async function updateUser(id, request, env, corsHeaders) {
  const {
    name,
    pin,
    role,
    work_start,
    work_end,
    force_pin_change,
    perm_users,
    perm_locations,
    perm_reports,
  } = await request.json();
  let q = "UPDATE users SET ";
  let p = [];
  let u = [];
  if (name) {
    u.push("name = ?");
    p.push(name);
  }
  if (role) {
    u.push("role = ?");
    p.push(role);
  }
  if (work_start) {
    u.push("work_start = ?");
    p.push(work_start);
  }
  if (work_end) {
    u.push("work_end = ?");
    p.push(work_end);
  }
  if (force_pin_change !== undefined) {
    u.push("force_pin_change = ?");
    p.push(force_pin_change);
  }
  if (perm_users !== undefined) {
    u.push("perm_users = ?");
    p.push(perm_users);
  }
  if (perm_locations !== undefined) {
    u.push("perm_locations = ?");
    p.push(perm_locations);
  }
  if (perm_reports !== undefined) {
    u.push("perm_reports = ?");
    p.push(perm_reports);
  }
  if (pin) {
    u.push("pin = ?");
    p.push(await hashPin(pin));
  }

  if (u.length === 0)
    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
    });
  q += u.join(", ") + " WHERE id = ?";
  p.push(id);
  await env.DB.prepare(q)
    .bind(...p)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function deleteUser(id, env, corsHeaders) {
  await env.DB.prepare("UPDATE users SET active = 0 WHERE id = ?")
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM pushy_tokens WHERE user_id = ?")
    .bind(id)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

// --- LOCATIONS ---

async function getLocations(env, corsHeaders) {
  const r = await env.DB.prepare(
    "SELECT * FROM locations WHERE active = 1 ORDER BY type, name"
  ).all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function createLocation(request, env, corsHeaders) {
  const { name, type } = await request.json();
  const ex = await env.DB.prepare(
    "SELECT id, active FROM locations WHERE name = ?"
  )
    .bind(name)
    .first();
  if (ex) {
    if (ex.active === 0) {
      await env.DB.prepare(
        "UPDATE locations SET active = 1, type = ? WHERE id = ?"
      )
        .bind(type, ex.id)
        .run();
      return new Response(JSON.stringify({ id: ex.id, name, type }), {
        headers: corsHeaders,
      });
    }
    return new Response(JSON.stringify({ error: "Już istnieje" }), {
      status: 400,
      headers: corsHeaders,
    });
  }
  const r = await env.DB.prepare(
    "INSERT INTO locations (name, type) VALUES (?, ?)"
  )
    .bind(name, type)
    .run();
  return new Response(JSON.stringify({ id: r.meta.last_row_id, name, type }), {
    headers: corsHeaders,
  });
}

async function deleteLocation(id, env, corsHeaders) {
  await env.DB.prepare("UPDATE locations SET active = 0 WHERE id = ?")
    .bind(id)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

// --- TASKS ---

async function getTasks(params, env, corsHeaders) {
  const date = params.get("date");
  const status = params.get("status");
  let q = `SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE 1=1`;
  let b = [];
  if (date) {
    q += " AND t.scheduled_date = ?";
    b.push(date);
  }
  if (status && status !== "all") {
    q += " AND t.status = ?";
    b.push(status);
  }
  q += ` ORDER BY CASE t.status WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'completed' THEN 3 END, CASE t.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.sort_order ASC, t.scheduled_time ASC`;
  const r = await env.DB.prepare(q)
    .bind(...b)
    .all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function getTask(id, env, corsHeaders) {
  const task = await env.DB.prepare(
    `SELECT t.*, u.name as assigned_name, c.name as creator_name, t.created_by as creator_id FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN users c ON t.created_by = c.id WHERE t.id = ?`
  )
    .bind(id)
    .first();
  if (!task)
    return new Response(JSON.stringify({ error: "Nie znaleziono" }), {
      status: 404,
      headers: corsHeaders,
    });
  const logs = await env.DB.prepare(
    `SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC`
  )
    .bind(id)
    .all();
  task.logs = logs.results;
  const drivers = await env.DB.prepare(
    `SELECT u.id, u.name FROM task_drivers td JOIN users u ON td.user_id = u.id WHERE td.task_id = ?`
  )
    .bind(id)
    .all();
  task.additional_drivers = drivers.results;
  return new Response(JSON.stringify(task), { headers: corsHeaders });
}

async function createTask(request, env, corsHeaders, userId) {
  const data = await request.json();
  const maxOrder = await env.DB.prepare(
    "SELECT MAX(sort_order) as max FROM tasks WHERE scheduled_date = ?"
  )
    .bind(data.scheduled_date)
    .first();
  const sortOrder = (maxOrder?.max || 0) + 1;
  
  // Użyj polskiego czasu dla created_at
  const polishNow = toPolishSQL(new Date());
  
  const res = await env.DB.prepare(
    `INSERT INTO tasks (task_type, description, material, location_from, location_to, department, scheduled_date, scheduled_time, priority, sort_order, notes, created_by, assigned_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      data.task_type || "transport",
      data.description,
      data.material || null,
      data.location_from || null,
      data.location_to || null,
      data.department || null,
      data.scheduled_date,
      data.scheduled_time || null,
      data.priority || "normal",
      sortOrder,
      data.notes || null,
      userId,
      data.assigned_to || null,
      polishNow  // Polski czas!
    )
    .run();
  const taskId = res.meta.last_row_id;

  const origin = new URL(request.url).origin;
  
  // Logika powiadomień: 
  // - Jeśli przypisane do kierowcy -> tylko ON
  // - Jeśli "Dowolny kierowca" -> wszyscy
  
  let driverIds = [];
  
  if (data.assigned_to) {
    // Tylko przypisany kierowca
    driverIds = [data.assigned_to];
  } else {
    // Wszyscy kierowcy
    const drivers = await env.DB.prepare(
      'SELECT id FROM users WHERE role = "driver" AND active = 1'
    ).all();
    driverIds = drivers.results.map((u) => u.id);
  }
  
  // Wyślij powiadomienia
  await notifyUsers(
    driverIds,
    "new_task",
    "Nowe zadanie",
    `Nowe zadanie: ${data.description}`,
    taskId,
    origin,
    env
  );

  return new Response(JSON.stringify({ id: taskId, success: true }), {
    headers: corsHeaders,
  });
}

async function updateTask(id, request, env, corsHeaders, userId) {
  const data = await request.json();
  const task = await env.DB.prepare("SELECT created_by FROM tasks WHERE id = ?")
    .bind(id)
    .first();
  if (userId !== 1 && task.created_by !== userId)
    return new Response(JSON.stringify({ error: "Brak uprawnień" }), {
      status: 403,
      headers: corsHeaders,
    });
  await env.DB.prepare(
    `UPDATE tasks SET task_type = ?, description = ?, material = ?, location_from = ?, location_to = ?, department = ?, scheduled_date = ?, scheduled_time = ?, priority = ?, notes = ?, assigned_to = ? WHERE id = ?`
  )
    .bind(
      data.task_type || "transport",
      data.description,
      data.material || null,
      data.location_from || null,
      data.location_to || null,
      data.department || null,
      data.scheduled_date,
      data.scheduled_time || null,
      data.priority || "normal",
      data.notes || null,
      data.assigned_to || null,
      id
    )
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function deleteTask(id, env, corsHeaders) {
  await env.DB.prepare("DELETE FROM task_logs WHERE task_id = ?")
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM task_drivers WHERE task_id = ?")
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM notifications WHERE task_id = ?")
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function updateTaskStatus(id, request, env, corsHeaders) {
  const { status, userId } = await request.json();
  const polishNow = toPolishSQL(new Date());
  
  let q = "UPDATE tasks SET status = ?";
  let b = [status];
  
  if (status === "in_progress") {
    q += ", started_at = ?, assigned_to = ?";
    b.push(polishNow, userId);
  } else if (status === "completed") {
    q += ", completed_at = ?";
    b.push(polishNow);
  } else if (status === "paused") {
    q += ", paused_at = ?";
    b.push(polishNow);
  }
  
  q += " WHERE id = ?";
  b.push(id);
  
  await env.DB.prepare(q)
    .bind(...b)
    .run();

  const statusLabels = {
    in_progress: "Rozpoczęto",
    completed: "Zakończono",
    pending: "Oczekuje",
    paused: "Wstrzymano",
  };
  
  await env.DB.prepare(
    "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
  )
    .bind(id, userId, "status_change", statusLabels[status] || status)
    .run();

  const task = await env.DB.prepare(
    "SELECT description, created_by, assigned_to FROM tasks WHERE id = ?"
  )
    .bind(id)
    .first();
  const statusText =
    status === "in_progress"
      ? "rozpoczęte"
      : status === "completed"
      ? "zakończone"
      : status;
  const origin = new URL(request.url).origin;

  // 1. Powiadom KIEROWNIKA (Twórcę zadania), jeśli to nie on zmienił status
  if (task.created_by && task.created_by != userId) {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        task.created_by,
        "status_change",
        "Zmiana statusu",
        `"${task.description}" - ${statusText}`,
        id
      )
      .run();
    await sendOneSignalNotification(
      [task.created_by],
      "Zmiana statusu",
      `"${task.description}" - ${statusText}`,
      { taskId: id },
      origin,
      env
    );
  } else if (!task.created_by) {
    // Fallback: Jeśli brak twórcy, powiadom wszystkich adminów (żeby nie zginęło)
    const admins = await env.DB.prepare(
      'SELECT id FROM users WHERE role = "admin" AND active = 1'
    ).all();
    for (const a of admins.results) {
      if (a.id == userId) continue; // Nie powiadamiaj sprawcy
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(
          a.id,
          "status_change",
          "Zmiana statusu",
          `"${task.description}" - ${statusText}`,
          id
        )
        .run();
      await sendOneSignalNotification(
        [a.id],
        "Zmiana statusu",
        `"${task.description}" - ${statusText}`,
        { taskId: id },
        origin,
        env
      );
    }
  }

  // 2. Powiadom KIEROWCĘ (Przypisanego), jeśli to nie on zmienił status (np. admin cofnął)
  // Uwaga: przy statusie 'in_progress' właśnie przypisujemy userId, więc assigned_to w bazie może być stary/null,
  // ale w argumencie funkcji updateTaskStatus userId to sprawca.
  // Logika: Jeśli status zmienił ADMIN, a zadanie jest przypisane do KIEROWCY (lub właśnie zostało), powiadom go.

  // Jeśli zadanie JEST lub BYŁO przypisane
  if (task.assigned_to && task.assigned_to != userId) {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        task.assigned_to,
        "status_change",
        "Aktualizacja zadania",
        `"${task.description}" - ${statusText}`,
        id
      )
      .run();
    await sendOneSignalNotification(
      [task.assigned_to],
      "Aktualizacja zadania",
      `"${task.description}" - ${statusText}`,
      { taskId: id },
      origin,
      env
    );
  }



  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function joinTask(id, request, env, corsHeaders) {
  const { userId } = await request.json();
  const ex = await env.DB.prepare(
    "SELECT id FROM task_drivers WHERE task_id = ? AND user_id = ?"
  )
    .bind(id, userId)
    .first();
  if (ex)
    return new Response(JSON.stringify({ error: "Już dołączyłeś" }), {
      status: 400,
      headers: corsHeaders,
    });
  await env.DB.prepare(
    "INSERT INTO task_drivers (task_id, user_id) VALUES (?, ?)"
  )
    .bind(id, userId)
    .run();
  const user = await env.DB.prepare("SELECT name FROM users WHERE id = ?")
    .bind(userId)
    .first();
  await env.DB.prepare(
    "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
  )
    .bind(id, userId, "status_change", `${user.name} dołączył`)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function reorderTasks(request, env, corsHeaders) {
  const { tasks, reason, userId } = await request.json();
  for (let i = 0; i < tasks.length; i++)
    await env.DB.prepare("UPDATE tasks SET sort_order = ? WHERE id = ?")
      .bind(i + 1, tasks[i])
      .run();
  if (reason && tasks.length > 0) {
    const user = await env.DB.prepare("SELECT name FROM users WHERE id = ?")
      .bind(userId)
      .first();
    await env.DB.prepare(
      "INSERT INTO task_logs (task_id, user_id, log_type, message) VALUES (?, ?, ?, ?)"
    )
      .bind(
        tasks[0],
        userId,
        "status_change",
        `Zmiana kolejności przez ${user.name}: ${reason}`
      )
      .run();
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

// --- TASK LOGS ---

async function getTaskLogs(id, env, corsHeaders) {
  const r = await env.DB.prepare(
    "SELECT tl.*, u.name as user_name FROM task_logs tl LEFT JOIN users u ON tl.user_id = u.id WHERE tl.task_id = ? ORDER BY tl.created_at DESC"
  )
    .bind(id)
    .all();
  return new Response(JSON.stringify(r.results), { headers: corsHeaders });
}

async function createTaskLog(id, request, env, corsHeaders) {
  const { userId, logType, message, delayReason, delayMinutes } =
    await request.json();

  const safeMessage = message || null;
  const safeReason = delayReason || null;
  const safeMinutes = delayMinutes || null;

  await env.DB.prepare(
    `INSERT INTO task_logs (task_id, user_id, log_type, message, delay_reason, delay_minutes) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, logType, safeMessage, safeReason, safeMinutes)
    .run();

  if (logType === "delay" || logType === "problem") {
    const task = await env.DB.prepare(
      "SELECT description, created_by FROM tasks WHERE id = ?"
    )
      .bind(id)
      .first();
    const user = await env.DB.prepare("SELECT name FROM users WHERE id = ?")
      .bind(userId)
      .first();

    const title = logType === "delay" ? "⏱️ Przestój" : "⚠️ Problem";
    const delayLabels = {
      no_access: "Brak dojazdu",
      waiting: "Oczekiwanie",
      traffic: "Korki",
      equipment: "Problem ze sprzętem",
      weather: "Pogoda",
      break: "Przerwa",
      other: "Inny",
    };

    const msgText =
      logType === "delay"
        ? `${user.name}: ${delayLabels[safeReason] || safeReason} (${
            safeMinutes || 0
          } min)`
        : `${user.name}: ${safeMessage}`;

    const origin = new URL(request.url).origin;

    // Powiadom TWÓRCĘ (Kierownika)
    if (task.created_by) {
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(task.created_by, logType, title, msgText, id)
        .run();
      await sendOneSignalNotification(
        [task.created_by],
        title,
        msgText,
        { taskId: id },
        origin,
        env
      );
    } else {
      // Fallback: Wszyscy admini
      const admins = await env.DB.prepare(
        'SELECT id FROM users WHERE role = "admin" AND active = 1'
      ).all();
      for (const a of admins.results) {
        await env.DB.prepare(
          "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
        )
          .bind(a.id, logType, title, msgText, id)
          .run();
        await sendOneSignalNotification(
          [a.id],
          title,
          msgText,
          { taskId: id },
          origin,
          env
        );
      }
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

// --- NOTIFICATIONS ---

async function getNotifications(uid, env, corsHeaders) {
  console.log(`📬 getNotifications called for user: ${uid}`);
  
  const r = await env.DB.prepare(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(uid)
    .all();
    
  const c = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0"
  )
    .bind(uid)
    .first();
    
  console.log(`📬 getNotifications result: ${r.results.length} notifications, ${c.count} unread`);
  
  return new Response(
    JSON.stringify({ notifications: r.results, unreadCount: c.count }),
    { headers: corsHeaders }
  );
}

async function markNotificationRead(id, env, corsHeaders) {
  await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?")
    .bind(id)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function markAllNotificationsRead(uid, env, corsHeaders) {
  await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")
    .bind(uid)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

async function deleteReadNotifications(uid, env, corsHeaders) {
  await env.DB.prepare(
    "DELETE FROM notifications WHERE user_id = ? AND is_read = 1"
  )
    .bind(uid)
    .run();
  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders,
  });
}

// --- REPORTS ---

async function getReports(period, env, corsHeaders) {
  let dateCondition = "";
  let isSingleDay = false;

  if (period.includes("-")) {
    if (period.length === 7) {
      dateCondition = `AND strftime('%Y-%m', t.scheduled_date) = '${period}'`;
    } else {
      dateCondition = `AND t.scheduled_date = '${period}'`;
      isSingleDay = true;
    }
  } else if (period === "week") {
    dateCondition = `AND t.scheduled_date >= date('now', '-7 days')`;
  } else if (period === "today") {
    dateCondition = `AND t.scheduled_date = date('now')`;
    isSingleDay = true;
  }

  const drivers = await env.DB.prepare(
    `SELECT id, name, work_start, work_end FROM users WHERE role = 'driver' AND active = 1`
  ).all();

  const driversStats = [];
  const now = new Date();

  for (const driver of drivers.results) {
    const tasks = await env.DB.prepare(
      `
            SELECT t.id, t.description, t.status, t.started_at, t.completed_at, t.scheduled_date
            FROM tasks t LEFT JOIN task_drivers td ON t.id = td.task_id
            WHERE (t.assigned_to = ? OR td.user_id = ?) ${dateCondition}
            AND t.started_at IS NOT NULL
            ORDER BY t.started_at
        `
    )
      .bind(driver.id, driver.id)
      .all();

    const delays = await env.DB.prepare(
      `
            SELECT tl.delay_minutes, tl.delay_reason, tl.created_at, t.id as task_id 
            FROM task_logs tl
            LEFT JOIN tasks t ON tl.task_id = t.id
            WHERE tl.user_id = ? AND tl.log_type = 'delay' ${dateCondition}
            ORDER BY tl.created_at
        `
    )
      .bind(driver.id)
      .all();

    let workMinutes = 0;
    let delayMinutes = 0;
    let timeline = [];
    let details = [];

    tasks.results.forEach((t) => {
      // FIX: Use raw strings for sending to frontend to avoid double-shifting.
      // Database stores "Polish Time" as raw string (e.g. 12:00).
      // Worker treats new Date("12:00") as 12:00 UTC.
      // So math (end - start) works fine as long as both are treated as UTC.
      // But we must send the RAW string "12:00" to frontend, not "12:00Z" (ISO).

      const startObj = new Date(t.started_at);
      let endObj;
      let endStr;

      if (t.completed_at) {
        endObj = new Date(t.completed_at);
        endStr = t.completed_at; // Raw DB string
      } else {
        // Task in progress: "Now" must be converted to Polish String to match DB format
        endStr = toPolishSQL(now);
        endObj = new Date(endStr);
      }

      const duration = Math.max(0, (endObj - startObj) / 1000 / 60);
      const type = t.status === "in_progress" ? "work-live" : "work";

      if (isSingleDay) {
        timeline.push({
          type,
          start: t.started_at,
          end: endStr,
          desc: t.description,
          duration: Math.round(duration),
        });
        details.push({
          // Frontend parses raw string "YYYY-MM-DD HH:MM:SS" as local time correctly
          time: new Date(t.started_at).toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          desc: t.description,
          duration: Math.round(duration),
          type,
        });

        const taskDelays = delays.results.filter((d) => d.task_id === t.id);
        taskDelays.forEach((d) => {
          const delayStartObj = new Date(d.created_at);
          const delayEndObj = new Date(
            delayStartObj.getTime() + d.delay_minutes * 60000
          );
          
          // Re-format delay end to string for consistency if needed, 
          // but timelines relying on ISO might need check. 
          // actually generateTimeline in app.js handles strings well.
          const delayEndStr = toPolishSQL(delayEndObj); 
          // Note: toPolishSQL expects Date or String. delayEndObj is Date (UTC-like).
          // Wait, delayEndObj is derived from delayStartObj (Date from String "12:00").
          // So delayEndObj is also "Visual UTC". 
          // We need to convert it back to "YYYY-MM-DD HH:MM:SS" string without timezone shift.
          // toPolishSQL does shifting! We don't want to shift again if it's already "Visual UTC".
          
          // Simple formatting function for "Visual UTC" Date to String
          const formatRaw = (d) => {
             return d.toISOString().replace('T', ' ').split('.')[0];
          };

          timeline.push({
            type: "delay",
            start: d.created_at,
            end: formatRaw(delayEndObj),
            desc: d.delay_reason,
            duration: d.delay_minutes,
          });
          details.push({
            time: new Date(d.created_at).toLocaleTimeString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            desc: `Przestój: ${d.delay_reason}`,
            duration: d.delay_minutes,
            type: "delay",
          });
        });
      } else {
        const date = t.scheduled_date;
        const existingBar = timeline.find((x) => x.date === date);
        if (existingBar) {
          existingBar.minutes += Math.round(duration);
          existingBar.percent = Math.min(
            100,
            Math.round((existingBar.minutes / 480) * 100)
          );
        } else {
          timeline.push({
            type: "bar",
            date,
            minutes: Math.round(duration),
            percent: Math.min(100, Math.round((duration / 480) * 100)),
          });
        }
      }
      workMinutes += duration;
    });

    delays.results.forEach((d) => (delayMinutes += d.delay_minutes || 0));

    let targetMinutes = 0;
    if (isSingleDay) {
      const [startH, startM] = (driver.work_start || "07:00").split(":");
      const [endH, endM] = (driver.work_end || "15:00").split(":");
      targetMinutes = Math.max(
        0,
        parseInt(endH) * 60 +
          parseInt(endM) -
          (parseInt(startH) * 60 + parseInt(startM)) -
          20
      );
    } else {
      const activeDays = new Set(tasks.results.map((t) => t.scheduled_date))
        .size;
      targetMinutes = activeDays * (480 - 20);
    }

    const realWorkMinutes = Math.max(0, workMinutes - delayMinutes);
    const efficiency =
      targetMinutes > 0
        ? Math.min(100, Math.round((realWorkMinutes / targetMinutes) * 100))
        : 0;

    driversStats.push({
      id: driver.id,
      name: driver.name,
      tasksCount: tasks.results.length,
      workTime: Math.round(realWorkMinutes),
      delayTime: Math.round(delayMinutes),
      kpi: efficiency,
      isSingleDay,
      timeline,
      details: details.sort((a, b) => a.time.localeCompare(b.time)),
    });
  }

  driversStats.sort((a, b) => b.kpi - a.kpi);
  return new Response(JSON.stringify({ drivers: driversStats }), {
    headers: corsHeaders,
  });
}

// --- ONESIGNAL SERVICE ---

// --- NOTIFICATION HELPERS ---

async function notifyUsers(userIds, type, title, message, taskId, origin, env) {
    if (!userIds || userIds.length === 0) return;
    
    // Convert to Array if it's a Set or single value
    const ids = Array.isArray(userIds) ? userIds : (userIds instanceof Set ? Array.from(userIds) : [userIds]);
    
    console.log(`📤 notifyUsers called for users: [${ids.join(', ')}]`);

    // 1. Insert into DB (for the "bell" in-app notifications)
    for (const userId of ids) {
        try {
            await env.DB.prepare(
                "INSERT INTO notifications (user_id, type, title, message, task_id) VALUES (?, ?, ?, ?, ?)"
            )
            .bind(userId, type, title, message, taskId || null)
            .run();
            console.log(`✅ DB notification inserted for user ${userId}`);
        } catch (e) {
            console.error(`❌ DB Notification error for user ${userId}:`, e);
        }
    }

    // 2. Send Push via OneSignal
    await sendOneSignalNotification(ids, title, message, { taskId }, origin, env);
}

async function sendOneSignalNotification(
  targetIds,
  title,
  message,
  data,
  origin,
  env
) {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) {
    console.warn("⚠️ OneSignal credentials missing");
    return;
  }

  const payload = {
    app_id: env.ONESIGNAL_APP_ID,
    include_external_user_ids: targetIds.map((id) => String(id)),
    headings: { en: title, pl: title },
    contents: { en: message, pl: message },
    data: data,
    web_url: `${origin}/?taskId=${data.taskId}`,
    
    // ❌ USUŃ TO (lub utwórz kanał w OneSignal Dashboard):
    // android_channel_id: "transport_tracker_main",
    
    // ✅ Użyj domyślnego kanału:
    priority: 10,
    ttl: 86400, // 24h
    
    // Chrome na Android
    chrome_web_icon: `${origin}/icon.png`,
    chrome_web_badge: `${origin}/badge.png`,
    chrome_web_image: `${origin}/icon.png`,
  };

  try {
    const resp = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${env.ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const responseJson = await resp.json();
    console.log(`📤 OneSignal Response:`, JSON.stringify(responseJson, null, 2));
    
    if (responseJson.errors) {
      console.error('❌ OneSignal API Errors:', responseJson.errors);
    }
    
    return responseJson;
  } catch (e) {
    console.error("❌ OneSignal error:", e);
  }
}

// =============================================
// MAIN EXPORT (JEDEN!)
// =============================================
export default {
  // Obsługa requestów HTTP
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });

    try {
      if (path.startsWith("/api/"))
        return await handleAPI(request, env, path, corsHeaders);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Internal Server Error" }),
        { status: 500, headers: corsHeaders }
      );
    }
  },

  // Cron job - automatyczne czyszczenie + migracja zadań (codziennie o 17:00 UTC / 18:00 PL zimą)
  async scheduled(event, env, ctx) {
    const polishNow = getPolishNow();
    const polishHour = polishNow.getHours();
    
    console.log(`🕐 Cron: Triggered at ${toPolishSQL(polishNow)} (Polish time)`);
    
    // Migracja zadań - tylko jeśli cron wykonuje się koło 18:00 czasu polskiego
    // (cron w Cloudflare działa na UTC, więc powinien być ustawiony na 17:00 UTC)
    if (polishHour >= 17 && polishHour <= 19) {
      console.log("🔄 Running task migration...");
      const migrationResult = await migratePendingTasks(env);
      console.log(`✅ Migrated ${migrationResult.migrated} tasks`);
    }

    console.log("🧹 Cron: Cleaning old data...");

    // Usuń wygasłe sesje
    const sessions = await env.DB.prepare(
      `DELETE FROM sessions WHERE expires_at < datetime('now')`
    ).run();
    console.log(`🧹 Deleted ${sessions.meta.changes} expired sessions`);

    // Usuń stare próby logowania
    const attempts = await env.DB.prepare(
      `DELETE FROM login_attempts WHERE updated_at < datetime('now', '-1 day')`
    ).run();
    console.log(`🧹 Deleted ${attempts.meta.changes} old login attempts`);

    console.log("🧹 Cron completed!");
  },
};
