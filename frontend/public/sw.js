// Service Worker para PWA - Distribuidora Tachi
const CACHE_NAME = 'distribuidora-tachi-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Caché aparte para el catálogo público (tablets sin internet en campo):
// imágenes de productos (CDN de Alegra, cross-origin) y la lista de
// productos, para que sigan disponibles después de la sincronización
// aunque el dispositivo se quede sin conexión.
const CATALOGO_IMAGENES_CACHE = 'catalogo-publico-imagenes-v1';
const CATALOGO_PRODUCTOS_CACHE = 'catalogo-publico-productos-v1';

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Error al cachear:', err);
      })
  );
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  const cachesToKeep = [CACHE_NAME, CATALOGO_IMAGENES_CACHE, CATALOGO_PRODUCTOS_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cachesToKeep.includes(cacheName)) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia: Network First, fallback a Cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NO interceptar métodos que no sean GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Imágenes del catálogo público (CDN de Alegra, cross-origin: cdn3.alegra.com
  // con URLs firmadas tipo /<hash>-<timestamp>-<archivo>?Expires=...&Signature=...):
  // CacheFirst, para que sigan viéndose sin internet después de una
  // sincronización. Van ANTES del check de "mismo origen" porque es externo.
  if (url.hostname.endsWith('.alegra.com') && url.hostname.startsWith('cdn')) {
    event.respondWith(
      caches.open(CATALOGO_IMAGENES_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          cache.put(event.request, response.clone()).catch(() => {});
          return response;
        } catch (err) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // NO interceptar requests a dominios externos (incluyendo el backend en otro dominio)
  if (url.origin !== location.origin) {
    // Dejar pasar sin interferir - esto resuelve problemas de CORS
    return;
  }

  // Lista de productos del catálogo público: NetworkFirst con respaldo en
  // caché, para que la última lista sincronizada siga sirviendo si falla la red.
  if (url.pathname === '/api/catalogo-publico/productos') {
    event.respondWith(
      caches.open(CATALOGO_PRODUCTOS_CACHE).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        } catch (err) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // NO cachear requests a API (solo assets estáticos)
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, clonarla y guardarla en cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch((err) => {
              console.log('[SW] Error cacheando:', err);
            });
          });
        }
        return response;
      })
      .catch(async () => {
        // Si falla la red, intentar obtener del cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si no hay cache para esta ruta específica, y es una navegación HTML, devolver index.html
        if (event.request.mode === 'navigate') {
          const indexResponse = await caches.match('/index.html');
          if (indexResponse) return indexResponse;
        }
        
        // Retornar una respuesta de error controlada en vez de undefined
        return new Response('Network error or resource not cached', { 
          status: 408, 
          headers: { 'Content-Type': 'text/plain' } 
        });
      })
  );
});

