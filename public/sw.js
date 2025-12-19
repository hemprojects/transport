// Service Worker do obsługi powiadomień Push

self.addEventListener('push', function(event) {
    if (!event.data) return;

    const data = event.data.json();
    
    // Opcje powiadomienia
    const options = {
        body: data.body,
        icon: '/icon.png', // Upewnij się że masz ikonę
        badge: '/badge.png', 
        vibrate: [100, 50, 100],
        data: {
            url: '/', // Zawsze otwieraj główną stronę
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

    // Szukamy otwartej karty
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Jeśli karta jest otwarta, skup się na niej
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Jeśli nie - otwórz nową
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});