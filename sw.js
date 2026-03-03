const CACHE_NAME = "chat-familiar-cache-v1";
const urlsToCache = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Instalación del Service Worker y cacheo de archivos estáticos
self.addEventListener("install", event => {
  console.log("[SW] Instalando y cacheando archivos estáticos");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting()) // Activar SW inmediatamente
  );
});

// Activación del SW y limpieza de caches viejos
self.addEventListener("activate", event => {
  console.log("[SW] Activado y limpiando caches viejos");
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Interceptar fetch solo para los archivos estáticos del frontend
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Solo manejar requests al mismo origen (tu frontend)
  if (url.origin === location.origin && urlsToCache.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
  // Requests externos (API, WebSocket, etc.) van directo a la red
});