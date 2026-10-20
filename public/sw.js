const CACHE = 'verteiler-v2';
const FILES = [
  'index.html', 'video.html', 'vorrat.html', 'touren.html',
  'css/style.css', 'js/nav.js', 'js/video.js', 'js/vorrat.js',
  'manifest.json', 'icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Netz zuerst, Cache als Fallback – so kommen Änderungen sofort an
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
