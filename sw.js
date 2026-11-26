'use strict';

/* =========================================================
   Pulso Service Worker (sw.js)
   Recebe Web Push Notifications reais (VAPID) em segundo plano e
   também agenda timers precisos (SCHEDULE_WATER_TIMER) com timestamp
   exato para disparar a notificação quando o cronômetro de água fechar
   (mesmo com o app fechado / em segundo plano).
   ========================================================= */

let scheduledWaterTimeout = null;
let scheduledWaterDueAt = 0;
let scheduledWaterPayload = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function buildNotificationOptions(payload) {
  return {
    body: payload.body,
    tag: payload.tag || 'pulso-push',
    renotify: true,
    requireInteraction: payload.requireInteraction !== false,
    vibrate: [200, 100, 200],
    timestamp: payload.dueAt || Date.now(),
    icon: payload.icon || 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    badge: payload.badge || 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
    data: {
      url: payload.url || './index.html#inicio',
      type: payload.type || 'general',
      dueAt: payload.dueAt || Date.now(),
    },
    actions: payload.actions || [
      { action: 'open', title: 'Registrar agora' },
    ],
  };
}

function scheduleLocalWaterAlarm(payload) {
  if (scheduledWaterTimeout) {
    clearTimeout(scheduledWaterTimeout);
    scheduledWaterTimeout = null;
  }

  if (!payload || !payload.enabled || !payload.dueAt) {
    scheduledWaterDueAt = 0;
    scheduledWaterPayload = null;
    return;
  }

  scheduledWaterDueAt = Number(payload.dueAt);
  scheduledWaterPayload = payload;
  const delayMs = Math.max(0, scheduledWaterDueAt - Date.now());

  // 1) Se o navegador suportar Notification Triggers API (showTrigger), agenda no SO no timestamp exato:
  if ('showTrigger' in Notification.prototype && typeof self.TimestampTrigger === 'function') {
    try {
      const opts = buildNotificationOptions(payload);
      opts.showTrigger = new self.TimestampTrigger(scheduledWaterDueAt);
      self.registration.showNotification(payload.title || '💧 Hora de beber água!', opts);
    } catch (e) {
      // Fallback para timer no Service Worker
    }
  }

  // 2) Timer preciso no Service Worker mantendo o worker ativo até o segundo exato do disparo:
  const firePromise = new Promise(resolve => {
    scheduledWaterTimeout = setTimeout(async () => {
      scheduledWaterTimeout = null;
      try {
        await self.registration.showNotification(
          payload.title || '💧 O timer de água fechou! Hora de beber água!',
          buildNotificationOptions({
            ...payload,
            tag: 'pulso-water-timer',
            url: './index.html#agua',
          })
        );
        // Notifica abas abertas (se houver) para reiniciar o próximo ciclo do timer
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'WATER_TIMER_FIRED', firedAt: Date.now(), dueAt: scheduledWaterDueAt });
        }
      } catch (err) {
        // Ignora erro
      }
      resolve();
    }, delayMs);
  });

  return firePromise;
}

// Recebe comandos do app.js para agendar ou cancelar o timer exato de água
self.addEventListener('message', event => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SCHEDULE_WATER_TIMER') {
    const promise = scheduleLocalWaterAlarm(data.payload);
    if (promise && event.waitUntil) {
      event.waitUntil(promise);
    }
  } else if (data.type === 'CANCEL_WATER_TIMER') {
    if (scheduledWaterTimeout) {
      clearTimeout(scheduledWaterTimeout);
      scheduledWaterTimeout = null;
    }
    scheduledWaterDueAt = 0;
    scheduledWaterPayload = null;
  }
});

// Escuta os disparos de Web Push vindos do servidor / GitHub Actions (VAPID)
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

  // Se o push de água chegou porque o timer fechou (ou está prestes a fechar com pequeno delay),
  // respeita o delay restante (se `dueAt` estiver nos próximos segundos) para disparar exatamente quando o timer zerar!
  const now = Date.now();
  const waitMs = payload.dueAt && payload.dueAt > now && (payload.dueAt - now) <= 120000
    ? (payload.dueAt - now)
    : 0;

  // Cancela alarme local duplicado do mesmo ciclo para não tocar 2 vezes
  if (payload.tag === 'pulso-water' || payload.tag === 'pulso-water-timer') {
    if (scheduledWaterTimeout) {
      clearTimeout(scheduledWaterTimeout);
      scheduledWaterTimeout = null;
    }
  }

  const options = buildNotificationOptions(payload);

  event.waitUntil(
    new Promise(resolve => setTimeout(resolve, waitMs)).then(() =>
      self.registration.showNotification(payload.title, options)
    )
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
