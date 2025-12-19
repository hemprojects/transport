// 1. Import Pushy Logic (Musi być na górze)
importScripts('https://sdk.pushy.me/web/1.0.8/pushy-service-worker.js');

// 2. Nasza własna obsługa powiadomienia (Nadpisuje domyślną Pushy)
self.addEventListener('push', function(event) {
    // Pushy wysyła dane w event.data
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch (e) {
        // Jeśli nie JSON, to zwykły tekst
        data = { message: event.data.text() };
    }
    
    // Pobierz dane z payloadu Pushy
    const title = data.title || 'TransportTracker';
    const body = data.message || data.body || 'Nowe powiadomienie';
    const taskId = data.taskId || data.data?.taskId;
    const tag = data.tag || (taskId ? `task-${taskId}` : 'default');

    // Opcje powiadomienia
    const options = {
        body: body,
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [100, 50, 100],
        data: {
            url: '/', 
            taskId: taskId
        },
        tag: tag, // To odpowiada za nadpisywanie! (np. task-123)
        renotify: true // Wibruj nawet jak nadpisujesz
    };

    // Wyświetl (nadpisując domyślne zachowanie Pushy)
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// 3. Obsługa kliknięcia (Otwieranie apki)
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
                    // Opcjonalnie: wyślij wiadomość do strony, żeby otworzyła zadanie
                    client.postMessage({ type: 'OPEN_TASK', taskId: event.notification.data.taskId });
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