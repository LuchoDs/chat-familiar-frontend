const CACHE_NAME = "chat-familiar-cache-v1";
const urlsToCache = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Instalación del service worker y cacheo de archivos
self.addEventListener("install", event => {
  console.log("[SW] Instalando y cacheando archivos");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()) // Activar SW inmediatamente
  );
});

// Activación del SW y limpieza de todos los caches viejos
self.addEventListener("activate", event => {
  console.log("[SW] Activado y limpiando caches");
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Interceptar fetch y siempre intentar actualizar desde red primero
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardar en cache la nueva versión
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, response.clone());
          return response;
        });
      })
      .catch(() => {
        // Si no hay red, servir del cache si existe
        return caches.match(event.request);
      })
  );
});