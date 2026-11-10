// Service Worker — cho app chạy khi mất mạng. Tăng VERSION mỗi lần cập nhật app.
const VERSION = 'oee-v1.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/nutrinest.css', './css/app.css',
  './js/app.js', './js/config.js', './js/data.js', './js/lib.js', './js/ui.js', './js/api.js', './js/store.js', './js/kpi.js',
  './js/views/login.js', './js/views/today.js', './js/views/form.js', './js/views/list.js', './js/views/faults.js',
  './js/views/kpis.js', './js/views/calendar.js', './js/views/reports.js', './js/views/admin.js',
  './js/views/import.js', './js/views/account.js', './js/views/print.js',
  './icons/logo.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'
];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Dữ liệu Supabase: luôn lấy từ mạng
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // Thư viện CDN & font: lấy cache trước
  if (CDN.some((h) => url.hostname === h)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }

  // File của app: mạng trước (luôn mới), mất mạng thì dùng cache
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || caches.match('./index.html'))));
  }
});
