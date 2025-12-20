// TransportTracker Service Worker
importScripts('https://sdk.pushy.me/web/1.0.24/pushy-service-worker.js');

self.addEventListener('push', function(event) {
    console.log('📬 Push received in SW');
    
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { message: event.data.text() };
    }

    console.log('📬 Push data:', data);

    const title = data.title || 'Transport Tracker';
    const body = data.message || data.body || 'Nowe powiadomienie';
    const taskId = data.taskId || (data.data && data.data.taskId);

    // Powiadom otwarte okna
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clientList) {
            clientList.forEach(function(client) {
                client.postMessage({
                    type: 'PUSH_RECEIVED',
                    data: { title, message: body, taskId }
                });
            });
        });

    // Pokaż powiadomienie systemowe
    const options = {
        body: body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        tag: taskId ? 'task-' + taskId : 'notif-' + Date.now(),
        renotify: true,
        data: { taskId }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const taskId = event.notification.data && event.notification.data.taskId;
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(clientList) {
                for (var i = 0; i < clientList.length; i++) {
                    var client = clientList[i];
                    if ('focus' in client) {
                        client.postMessage({ type: 'NOTIFICATION_CLICK', taskId: taskId });
                        return client.focus();
                    }
                }
                return self.clients.openWindow('/');
            })
    );
});

self.addEventListener('install', function(event) {
    console.log('📬 SW installed');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('📬 SW activated');
    event.waitUntil(self.clients.claim());
});