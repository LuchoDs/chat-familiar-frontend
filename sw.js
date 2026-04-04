//sw.JS

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

  // Si es un archivo que tenemos en cache
  if (url.origin === location.origin && urlsToCache.includes(url.pathname)) {
    event.respondWith(
      // Estrategia: "Network First" (Intentar red, si falla usar cache)
      // Así nos aseguramos de que si hay cambios en el CSS o JS, el celu los baje
      fetch(event.request)
        .then(response => {
          // Si la red responde bien, actualizamos el cache y devolvemos la respuesta
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
          return response;
        })
        .catch(() => caches.match(event.request)) // Si no hay internet, usamos el cache
    );
  }
});
// Escuchar las notificaciones Push
self.addEventListener('push', function(event) {
    // Definimos el texto genérico que se verá SIEMPRE
    const tituloFijo = 'Chat Familiar';
    const cuerpoFijo = 'Tienes nuevos mnesajes..🐕🐩';

    const options = {
        body: cuerpoFijo,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png', // Icono chiquito para la barra de estado
        vibrate: [100, 50, 100],
        tag: 'chat-fam-pila',        // CLAVE: Mantiene una sola notificación activa
        renotify: true,              // CLAVE: Vibra con cada mensaje nuevo que entra
        data: {
            url: self.location.origin // Al tocar, abre la web
        }
    };

    event.waitUntil(
        self.registration.showNotification(tituloFijo, options)
    );
});

// Manejar el clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Cerramos la notificación al tocarla
    event.waitUntil(
        clients.openWindow(event.notification.data.url) // Abrimos la App
    );
});