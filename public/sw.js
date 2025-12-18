// Service Worker do obsługi powiadomień Push

self.addEventListener('push', function(event) {
    if (!event.data) return;

    const data = event.data.json();
    
    // Opcje powiadomienia
    const options = {
        body: data.body,
        icon: '/icon.png', // Upewnij się że masz ikonę, albo usuń tę linię
        badge: '/badge.png', // Mała ikona na pasku (opcjonalnie)
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/',
            taskId: data.taskId
        },
        tag: data.tag || 'default', // Kluczowe dla nadpisywania!
        renotify: true // Czy wibrować przy nadpisaniu? (true = tak)
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const urlToOpen = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(windowClients) {
            // Jeśli apka otwarta - skup na niej
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Jeśli nie - otwórz nową
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});