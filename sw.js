'use strict';

/* =========================================================
   Pulso Service Worker (sw.js)
   Recebe Web Push Notifications reais (VAPID) em segundo plano,
   mesmo com o navegador fechado, para Água, Alimentação e Treino (24h).
   ========================================================= */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Escuta os disparos de Web Push vindos do servidor / GitHub Actions
self.addEventListener('push', event => {
  let payload = {
    title: 'Pulso · Lembrete de Meta',
    body: 'Abra o app para registrar seu treino, água ou alimentação!',
    tag: 'pulso-push',
    url: './index.html#inicio',
    actions: [
      { action: 'open', title: 'Abrir Pulso' },
    ],
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    tag: payload.tag || 'pulso-push',
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    vibrate: [200, 100, 200],
    icon: payload.icon || 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    badge: payload.badge || 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    data: {
      url: payload.url || './index.html#inicio',
      type: payload.type || 'general',
    },
    actions: payload.actions || [
      { action: 'open', title: 'Registrar agora' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Abre a aba correspondente (Água, Calorias ou Treinos) quando o usuário toca na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './index.html#inicio';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
