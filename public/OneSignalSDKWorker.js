self.onmessage = function (e) { };
// Fix for Chrome: Event handler of 'message' event must be added on the initial evaluation of worker script.
// Must be at the very top for some Chrome versions.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// PWA: skipWaiting i clients.claim dla szybkiego odświeżania po aktualizacji
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Strategia Network-First dla HTML i API
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Obsługa przeładowania strony i API (zawsze najpierw sieć)
    if (event.request.mode === 'navigate' || url.pathname.startsWith('/api')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request);
                })
        );
    }
});

// Obsługa kliknięcia w powiadomienie (dla naszych lokalnych notyfikacji)
self.addEventListener('notificationclick', function (event) {
    const taskId = event.notification.data?.taskId;
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                // Jeśli jest otwarte okno - focus
                for (const client of clients) {
                    if ('focus' in client) {
                        client.focus();
                        if (taskId) {
                            client.postMessage({
                                type: 'NOTIFICATION_CLICK',
                                taskId: taskId
                            });
                        }
                        return;
                    }
                }
                // Jeśli nie ma okna - otwórz
                return self.clients.openWindow(taskId ? `/?taskId=${taskId}` : '/');
            })
    );
});