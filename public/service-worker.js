// Pushy Service Worker
importScripts('https://sdk.pushy.me/web/1.0.24/pushy-service-worker.js');

// Własny handler push
self.addEventListener('push', function(event) {
    console.log('📬 Push received in SW');
    
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { message: event.data.text() };
    }

    const title = data.title || 'Transport Tracker';
    const body = data.message || data.body || 'Nowe powiadomienie';
    const taskId = data.taskId || data.data?.taskId;

    const options = {
        body: body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        tag: taskId ? `task-${taskId}` : `notif-${Date.now()}`,
        renotify: true,
        requireInteraction: false,
        data: { taskId }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Kliknięcie w powiadomienie
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.postMessage({ 
                        type: 'NOTIFICATION_CLICK', 
                        taskId: event.notification.data?.taskId 
                    });
                    return client.focus();
                }
            }
            return clients.openWindow('/');
        })
    );
});

// Aktywacja - przejmij kontrolę
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});