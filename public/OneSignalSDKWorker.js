// Fix for Chrome: Event handler of 'message' event must be added on the initial evaluation of worker script.
// Must be at the very top for some Chrome versions.
self.addEventListener('message', () => {
    // Empty listener to satisfy Chrome initialization check
});

importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

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