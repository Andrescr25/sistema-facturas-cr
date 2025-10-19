// Service Worker para PWA - Distribuidora Tachi
const CACHE_NAME = 'distribuidora-tachi-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

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
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
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
  
  // NO interceptar requests a dominios externos (incluyendo el backend en otro dominio)
  if (url.origin !== location.origin) {
    // Dejar pasar sin interferir - esto resuelve problemas de CORS
    return;
  }
  
  // NO interceptar métodos que no sean GET
  if (event.request.method !== 'GET') {
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
      .catch(() => {
        // Si falla la red, intentar obtener del cache
        return caches.match(event.request);
      })
  );
});

