'use strict';

const BASE = '/asea-calendar-management';

self.addEventListener('push', e => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) {}

  const ownerKey  = payload.owner_key || 'default';
  const parkingUrl = BASE + '/parking.html' + (ownerKey !== 'default' ? '?key=' + encodeURIComponent(ownerKey) : '');

  e.waitUntil(
    self.registration.showNotification(payload.title || '주차 위치 미등록', {
      body: payload.body || '출차 이후 차량 위치가 입력되지 않았습니다.',
      icon: BASE + '/icons/car-192.png',
      badge: BASE + '/icons/badge-72.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'driving', title: '운행 중' },
        { action: 'input',   title: '위치 입력' },
      ],
      data: { url: parkingUrl },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'driving') return;
  const url = e.notification.data?.url || BASE + '/parking.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('parking.html') && 'focus' in c) { c.focus(); return; }
      }
      if (clients.openWindow) clients.openWindow(url);
    })
  );
});
