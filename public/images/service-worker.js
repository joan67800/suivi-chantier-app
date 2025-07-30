const CACHE_NAME = 'suivi-chantier-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  // Ajoutez ici les autres fichiers CSS ou JS si vous en avez
  '/__/firebase/10.8.0/firebase-app.js', // Assurez-vous des bonnes versions
  '/__/firebase/10.8.0/firebase-auth.js',
  '/__/firebase/10.8.0/firebase-firestore.js',
  '/__/firebase/10.8.0/firebase-storage.js',
  '/__/firebase/10.8.0/firebase-functions.js',
  '/__/firebase/init.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});