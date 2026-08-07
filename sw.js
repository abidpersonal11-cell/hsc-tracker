// v5: fixes two remaining staleness issues from v4.
//  1. `fetch(event.request)` for HTML pages could still be silently answered
//     from the *browser's own* HTTP cache (not just this Cache Storage),
//     which meant "network-first" wasn't always truly hitting the network.
//     Now uses { cache: 'no-store' } to force a real network round-trip.
//  2. CACHE_NAME bumped so old cached entries are dropped on activate.
// Also: register this file with a "?v=" query string from index.html on every
// deploy (see SW_VERSION there) — GitHub Pages' CDN can itself cache sw.js for
// a few minutes, so without a changing URL the browser may never notice a new
// version of this file exists at all.
const CACHE_NAME = 'hsc-tracker-shell-v5';
const SHELL_FILES = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Each file cached independently — one CDN hiccup during install
      // shouldn't stop the rest (and the local shell) from being cached.
      Promise.all(SHELL_FILES.map((url) =>
        cache.add(url).catch((e) => console.warn('precache failed', url, e))
      ))
    )
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

// Actual live traffic (Realtime Database sync + Auth token/API calls) —
// this must always hit the network and is never cached or served offline.
function isLiveApiRequest(url) {
  return (
    url.includes('firebaseio.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('www.googleapis.com')
  );
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (isLiveApiRequest(url)) {
    return; // let the browser handle it normally, always live
  }

  // Network-first for the page itself (index.html / navigations), so code
  // changes show up immediately on next load instead of serving a stale
  // cached copy. `cache: 'no-store'` forces a real network hit instead of
  // letting the browser's own HTTP cache silently answer this fetch — that
  // was the gap that let old builds keep showing up after a deploy even
  // though this handler already looked "network-first". Falls back to the
  // Cache Storage copy only if there's genuinely no network (offline).
  const isHtmlRequest = event.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('.html');
  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (fonts, Firebase SDK scripts, icons,
  // manifest). On a cache miss, fetch from network AND store the result
  // so it's available offline from then on.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
