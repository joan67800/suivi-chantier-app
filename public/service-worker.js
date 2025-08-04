// Nom du cache. Changez le numéro de version (v1, v2...) si vous modifiez cette liste.
const CACHE_NAME = 'suivi-chantier-cache-v1';

// Liste des fichiers essentiels à mettre en cache pour que l'application fonctionne hors ligne.
const urlsToCache = [
  '/',
  '/index.html',
  './images/logo.png', // Ajout du logo pour qu'il s'affiche hors ligne

  // Scripts Firebase utilisés dans votre index.html
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js'
];

// Étape 1: Installation du Service Worker
// S'exécute lorsque le navigateur installe le service worker pour la première fois.
self.addEventListener('install', event => {
  // Le navigateur attend que la mise en cache soit terminée avant de finir l'installation.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache ouvert. Mise en cache des fichiers de l\'application.');
        return cache.addAll(urlsToCache);
      })
  );
});

// Étape 2: Interception des requêtes réseau
// S'exécute à chaque fois que l'application fait une requête (demande une page, une image, etc.).
self.addEventListener('fetch', event => {
  event.respondWith(
    // On cherche d'abord dans le cache si la ressource demandée existe.
    caches.match(event.request)
      .then(response => {
        // Si la ressource est dans le cache, on la retourne.
        if (response) {
          return response;
        }
        // Sinon, on essaie de la récupérer via le réseau.
        return fetch(event.request);
      }
    )
  );
});