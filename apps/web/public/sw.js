/* Service worker de Biblio — généré par scripts/build.mjs (VERSION et PRECACHE sont remplacés au build). */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = 'biblio-shell-' + VERSION;
const RUNTIME = 'biblio-runtime-v1';
const IMAGES = 'biblio-images-v1';
const MAX_IMAGES = 200;

self.addEventListener('install', (e) => {
  // Pas de skipWaiting automatique : la page propose « Actualiser » pour ne pas couper une saisie en cours.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('biblio-shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)));
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req)
    .then((r) => {
      if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
      return r;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

async function cacheFirstImage(req) {
  const c = await caches.open(IMAGES);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) {
      c.put(req, r.clone());
      trim(IMAGES, MAX_IMAGES);
    }
    return r;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages : l’application est une page unique, servie depuis le cache (puis le réseau en secours).
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match(new URL('./index.html', self.registration.scope).href).then((r) => r || fetch(req))
    );
    return;
  }
  // Fichiers de l’application : cache d’abord.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  // Lecteur de code-barres (CDN) : mis en cache à la première utilisation.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }
  // Couvertures de livres.
  if (req.destination === 'image') {
    e.respondWith(cacheFirstImage(req));
  }
  // Le reste (API Google Books, Open Library) : réseau uniquement.
});
