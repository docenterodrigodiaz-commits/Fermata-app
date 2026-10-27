/* Fermata service worker. Versión de caché inyectada por build.py. */
const VERSION = '5ae6d4178d';
const CACHE = 'fermata-app-' + VERSION;      // se limpia en cada versión nueva
const FONTS = 'fermata-fonts';               // persistente: solo la hoja CSS de Google Fonts
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('fermata-') && k !== CACHE && k !== FONTS)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

function isFontCss(url) {
  return url.origin === 'https://fonts.googleapis.com' && url.pathname.startsWith('/css');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Hoja CSS de fuentes: stale-while-revalidate, fallo silencioso sin red.
  if (isFontCss(url)) {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => {
          if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {});
          return r;
        }).catch(() => null);
        if (hit) { e.waitUntil(net); return hit; }
        return (await net) || new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
      })
    );
    return;
  }

  // Todo lo que no sea de nuestro origen pasa directo a la red (sin caché).
  if (url.origin !== self.location.origin) return;

  // Navegaciones: offline-first sirviendo el index precacheado.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html', { cacheName: CACHE })
        .then((r) => r || fetch(req))
        .catch(() => new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
    );
    return;
  }

  // Resto de recursos del mismo origen: caché primero, red como respaldo (sin cachear nada nuevo).
  e.respondWith(
    caches.match(req, { cacheName: CACHE }).then((hit) => hit || fetch(req))
      .catch(() => new Response('', { status: 504 }))
  );
});
