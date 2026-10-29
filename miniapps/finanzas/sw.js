// Service worker: guarda la app en caché para que abra sin internet.
// Al publicar cambios, sube el número de VERSION para que los teléfonos descarguen la nueva versión.
const VERSION = 'finanzas-v8';
const CACHE_FUENTES = 'finanzas-fuentes';
const ARCHIVOS = [
    './',
    './index.html',
    './css/styles.css',
    './js/voz.js',
    './js/intereses.js',
    './js/app.js',
    './js/pagos.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(claves => Promise.all(
            claves.filter(c => c !== VERSION && c !== CACHE_FUENTES).map(c => caches.delete(c))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);

    // Google Fonts: caché primero (no cambian), así la tipografía también funciona sin internet
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.open(CACHE_FUENTES).then(cache =>
                cache.match(event.request).then(guardada => guardada || fetch(event.request).then(resp => {
                    cache.put(event.request, resp.clone());
                    return resp;
                }))
            )
        );
        return;
    }

    if (url.origin !== self.location.origin) return;

    // Red primero (para recibir actualizaciones); si no hay conexión, usa la caché
    event.respondWith(
        fetch(event.request)
            .then(resp => {
                const copia = resp.clone();
                caches.open(VERSION).then(cache => cache.put(event.request, copia));
                return resp;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});
