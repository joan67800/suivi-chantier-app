// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker enregistré avec succès !');
      })
      .catch(error => {
        console.log('Échec de l\'enregistrement du Service Worker :', error);
      });
  });
}