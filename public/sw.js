// Push notifications for the coach (ticket 026). ponytail: push +
// notificationclick only — no offline caching, that's a separate concern.

self.addEventListener('push', (event) => {
  const text = event.data ? event.data.text() : 'Chess Master'
  event.waitUntil(self.registration.showNotification('Chess Master', { body: text, icon: '/icon-192.png' }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const c of clients) if ('focus' in c) return c.focus()
      return self.clients.openWindow('/')
    }),
  )
})
