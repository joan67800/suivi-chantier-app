// Ce script est à usage unique pour définir le premier administrateur.
// Il ne sera pas déployé, juste exécuté localement.

// UID de l'utilisateur à nommer administrateur
const uidToMakeAdmin = 'Gz2BmJ9EuvbSceZZ1jwap8HUgd82';

// Initialisation de l'Admin SDK de Firebase
const admin = require('firebase-admin');

// IMPORTANT: Vous devez avoir votre fichier de clés de service.
// Allez dans Paramètres du projet > Comptes de service > Générer une nouvelle clé privée.
// Renommez le fichier téléchargé en "serviceAccountKey.json" et placez-le dans le dossier "functions".
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// La fonction qui définit le custom claim "admin"
async function setAdminClaim(uid) {
  if (!uid) {
    console.error("L'UID n'est pas défini. Veuillez vérifier la variable 'uidToMakeAdmin'.");
    process.exit(1);
  }
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`\n✅ Succès ! L'utilisateur ${uid} est maintenant un administrateur.\n`);
    console.log("👉 Vous pouvez maintenant supprimer ce script (setAdmin.js) et le fichier serviceAccountKey.json.");
    console.log("👉 Pensez à faire un rechargement forcé (Ctrl+F5) de votre application avant de vous reconnecter.");
  } catch (error) {
    console.error('❌ Erreur lors de la définition du statut admin :', error);
  }
  process.exit(0);
}

// Lancement du script
console.log(`Tentative de définir l'utilisateur ${uidToMakeAdmin} comme admin...`);
setAdminClaim(uidToMakeAdmin);

