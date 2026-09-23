// Ceepeefy Progressive Web App Service Worker
const CACHE_VERSION = 'ceepeefy-v1';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `runtime-${CACHE_VERSION}`;

// Essential core assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
];

// URLs/Patterns to NEVER cache (Sensitive data, dynamic APIs, audio streams)
const NETWORK_ONLY_PATTERNS = [
  /\/api\//,
  /supabase\.co/,
  /lh3\.googleusercontent\.com/,
  /\.(mp3|m4a|wav|ogg|flac|aac)(\?.*)?$/i,
  /\/audio\//,
  /auth/,
];

// Helper to determine if a URL should bypass cache
function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url.href));
}

// Install Event: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then(async (cache) => {
        // Attempt precaching, gracefully continue if some assets fail
        try {
          await cache.addAll(PRECACHE_ASSETS);
        } catch (err) {
          console.warn('[PWA SW] Precache warning (non-fatal):', err);
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up outdated caches from previous versions
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE_NAME, RUNTIME_CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[PWA SW] Removing old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Bypass chrome-extension and non-http(s) schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. Network-Only for APIs, auth, Supabase, audio streams
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 4. Navigation requests (HTML pages)
  // Strategy: Network-first, fall back to cache, then fallback to /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Check cached version of this exact navigation request
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // Fallback to pre-cached /offline page
          const offlinePage = await caches.match('/offline');
          if (offlinePage) {
            return offlinePage;
          }

          // Basic HTML fallback in case /offline isn't in cache
          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Offline | Ceepeefy</title>
                <style>
                  body { background: #0b1326; color: #dae2fd; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
                  .card { background: rgba(23,31,51,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 2.5rem; max-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
                  h1 { color: #4cd7f6; margin-top: 0; }
                  p { color: #bcc9cd; line-height: 1.5; }
                  button { background: #4cd7f6; color: #003640; border: none; padding: 0.75rem 1.5rem; font-weight: bold; border-radius: 9999px; cursor: pointer; margin-top: 1rem; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>You're Offline</h1>
                  <p>You appear to be without an internet connection. Previously downloaded songs are accessible in your Offline Library.</p>
                  <button onclick="window.location.reload()">Retry Connection</button>
                </div>
              </body>
            </html>`,
            {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // 5. Static Assets (Next.js scripts, CSS, static images, fonts)
  // Strategy: Stale-While-Revalidate
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      /\.(png|jpg|jpeg|svg|webp|ico|woff|woff2|ttf|css|js)$/i.test(url.pathname));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with runtime cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Listen for messages from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
