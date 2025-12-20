// TransportTracker Service Worker
// NIE importujemy pushy-service-worker - sami obsługujemy

self.addEventListener('push', function(event) {
    console.log('📬 Push received');
    
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { message: event.data.text() };
    }

    const title = data.title || 'Transport Tracker';
    const body = data.message || data.body || 'Nowe powiadomienie';
    const taskId = data.taskId || (data.data && data.data.taskId);

    // Powiadom otwarte okna
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'PUSH_RECEIVED',
                    data: { title, message: body, taskId }
                });
            });
        });

    // Pokaż powiadomienie
    event.waitUntil(
        self.registration.showNotification(title, {
            body: body,
            icon: '/icon.png',
            badge: '/icon.png',
            vibrate: [200, 100, 200],
            tag: taskId ? 'task-' + taskId : 'notif-' + Date.now(),
            renotify: true,
            data: { taskId }
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
            if (clients.length > 0) {
                clients[0].postMessage({ 
                    type: 'NOTIFICATION_CLICK', 
                    taskId: event.notification.data?.taskId 
                });
                return clients[0].focus();
            }
            return self.clients.openWindow('/');
        })
    );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));