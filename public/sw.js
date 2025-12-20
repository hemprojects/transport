// TransportTracker Service Worker

self.addEventListener('push', function(event) {
    console.log('📬 Push received');
    
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { message: event.data.text() };
    }

    console.log('📬 Data:', data);

    const title = data.title || 'Transport Tracker';
    const body = data.message || data.body || 'Nowe powiadomienie';
    const taskId = data.taskId || (data.data && data.data.taskId);

    // 1. Wyślij wiadomość do otwartej strony (aktualizacja badge)
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            clientList.forEach(function(client) {
                client.postMessage({
                    type: 'PUSH_RECEIVED',
                    data: {
                        title: title,
                        message: body,
                        taskId: taskId
                    }
                });
            });
        })
    );

    // 2. Pokaż powiadomienie systemowe
    const options = {
        body: body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        tag: taskId ? 'task-' + taskId : 'notif-' + Date.now(),
        renotify: true,
        data: { taskId: taskId }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const taskId = event.notification.data && event.notification.data.taskId;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Jeśli apka otwarta - skup się na niej i wyślij info o kliknięciu
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        taskId: taskId
                    });
                    return client.focus();
                }
            }
            // Jeśli zamknięta - otwórz
            return clients.openWindow('/');
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(clients.claim());
});

self.addEventListener('install', function(event) {
    self.skipWaiting();
});