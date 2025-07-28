// Nom du cache. Changez la version si vous mettez à jour les fichiers.
const CACHE_NAME = 'suivi-chantier-cache-v1';

// Les fichiers de base de votre application à mettre en cache.
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  // Ajoutez ici les chemins vers vos icônes et logo si vous le souhaitez
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png'
];

// Événement d'installation : on met les fichiers en cache.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert');
        return cache.addAll(urlsToCache);
      })
  );
});

// Événement fetch : on intercepte les requêtes.
self.addEventListener('fetch', event => {
  // On ne met pas en cache les requêtes vers l'API Firebase !
  if (event.request.url.includes('firestore.googleapis.com')) {
    return; // On laisse la requête se faire normalement sur le réseau.
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la ressource est dans le cache, on la retourne.
        if (response) {
          return response;
        }
        // Sinon, on fait la requête réseau.
        return fetch(event.request);
      })
  );
});