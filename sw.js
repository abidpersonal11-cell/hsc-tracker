const CACHE_NAME = 'hsc-tracker-shell-v3';
const SHELL_FILES = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache Firebase/API traffic — always live.
  if (url.includes('firebaseio.com') || url.includes('googleapis.com')) {
    return;
  }

  // Network-first for the page itself (index.html / navigations), so code
  // changes show up immediately on next load instead of serving a stale
  // cached copy. Falls back to cache only if there's no network (offline).
  const isHtmlRequest = event.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('.html');
  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
