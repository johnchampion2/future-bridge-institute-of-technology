/* FBITI SYS – service worker: installable + works offline (app shell cached) */
const VERSION = 'fbiti-sys-v3';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/app.js', 'manifest.json',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/favicon.png', 'assets/logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;                                              // API calls (POST) always go to the network
  if (u.hostname.endsWith('google.com') || u.hostname.endsWith('googleusercontent.com')) return;
  if (r.mode === 'navigate') {                                                 // pages: network first, cached copy when offline
    e.respondWith(fetch(r).then(res => { caches.open(VERSION).then(c => c.put('index.html', res.clone())); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => {                                  // files: cached copy now, refreshed in background
    const net = fetch(r).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(r, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  }));
});
