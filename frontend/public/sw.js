// Service Worker para PWA - Distribuidora Tachi
const CACHE_NAME = 'distribuidora-tachi-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Si estamos en localhost (desarrollo), autodesinstalar el Service Worker inmediatamente para evitar caché agresiva
if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
  self.addEventListener('install', () => {
    self.skipWaiting();
  });
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      self.registration.unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach(client => client.navigate(client.url));
        })
    );
  });
} else {
  // Instalación del Service Worker (Producción)
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

  // Activación del Service Worker (Producción)
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

  // Estrategia: Network First, fallback a Cache (Producción)
  self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // NO interceptar requests a dominios externos (incluyendo el backend en otro dominio)
    if (url.origin !== location.origin) {
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
          return caches.match(event.request);
        })
    );
  });
}

