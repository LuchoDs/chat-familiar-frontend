const CACHE_NAME = "chat-familiar-cache-v1";
const urlsToCache = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// =========================
// INSTALACIÓN Y CACHE
// =========================
self.addEventListener("install", event => {
  console.log("[SW] Instalando y cacheando archivos estáticos");
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// =========================
// ACTIVACIÓN Y LIMPIEZA
// =========================
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

// =========================
// FETCH PARA ARCHIVOS ESTÁTICOS
// =========================
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin && urlsToCache.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

// =========================
// PUSH NOTIFICATIONS
// =========================
self.addEventListener("push", event => {
  let data = { title: "Nuevo mensaje", body: "Tenés un mensaje nuevo", url: "/" };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.error("Error parseando push", err);
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url } // Para abrir la app al click
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// =========================
// CLICK SOBRE NOTIFICACIÓN
// =========================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url = event.notification.data.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window" }).then(windowClients => {
      for (let client of windowClients) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});