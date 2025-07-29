const CACHE_NAME = 'suivi-chantier-cache-v2'; // version mise à jour
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png'
];

// Installation : mise en cache des fichiers de base
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert et fichiers ajoutés');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // force le service worker à devenir actif immédiatement
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Suppression ancien cache:', cache);
            return caches.delete(cache);
          }
        })
      )
    )
  );
  self.clients.claim(); // prend le contrôle immédiatement
});

// Interception des requêtes
self.addEventListener('fetch', event => {
  // Ignore les requêtes Firestore (tu peux ajouter d'autres API si besoin)
  if (event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Retourne la ressource du cache
          return response;
        }

        // Sinon, va chercher sur le réseau
        return fetch(event.request)
          .then(networkResponse => {
            // Optionnel : mettre en cache la nouvelle ressource récupérée
            // Attention à ne pas mettre en cache les requêtes POST ou autres non GET
            if (event.request.method === 'GET') {
              return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResponse.clone());
                return networkResponse;
              });
            } else {
              return networkResponse;
            }
          })
          .catch(() => {
            // Fallback en cas d'erreur réseau (ex: offline)
            if (event.request.destination === 'document') {
              // Si c’est une navigation vers une page HTML, retourne la page offline
              return caches.match('/offline.html');
            }
          });
      })
  );
});
