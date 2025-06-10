// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.setUserAsAdmin = functions.https.onCall(async (data, context) => {
  console.log("--- Début de l'exécution de setUserAsAdmin ---");

  if (!context.auth) {
    console.error("ERREUR CRITIQUE: context.auth est manquant. La fonction va s'arrêter.");
    throw new functions.https.HttpsError("unauthenticated", "La fonction doit être appelée par un utilisateur authentifié.");
  }

  console.log("Vérification de l'authentification : OK. UID de l'appelant :", context.auth.uid);

  const targetUserUID = data.uid;
  const isAdminStatus = data.isAdmin;

  console.log("Données reçues : UID Cible =", targetUserUID, ", Statut Admin =", isAdminStatus);

  if (!targetUserUID || typeof isAdminStatus !== "boolean") {
    console.error("ERREUR CRITIQUE: Arguments invalides. La fonction va s'arrêter.");
    throw new functions.https.HttpsError("invalid-argument", "L'UID de l'utilisateur cible et le statut admin (isAdmin: true/false) sont requis.");
  }

  try {
    console.log("Tentative de définition du custom claim...");
    await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});
    console.log("SUCCÈS : Custom claim défini.");

    console.log("Tentative de mise à jour de Firestore...");
    await admin.firestore().collection("users").doc(targetUserUID).set({role: isAdminStatus ? "admin" : "user"}, {merge: true});
    console.log("SUCCÈS : Firestore mis à jour.");

    console.log("--- Fin de l'exécution de setUserAsAdmin (Succès) ---");
    return {message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`};
  } catch (error) {
    console.error("--- ERREUR CRITIQUE dans le bloc try/catch ---");
    console.error("Message de l'erreur :", error.message);
    console.error("Trace de l'erreur :", error.stack);
    console.log("--- Fin de l'exécution de setUserAsAdmin (Échec) ---");
    throw new functions.https.HttpsError("internal", "Erreur interne lors de la définition du rôle. Vérifiez les journaux de la fonction.");
  }
});