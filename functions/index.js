// Dans functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.setUserAsAdmin = functions.https.onCall(async (data, context) => {
  // NOUVEAUX LOGS DE DÉBOGAGE AU TOUT DÉBUT
  console.log("Fonction setUserAsAdmin appelée.");
  console.log("Données reçues (data):", data ? JSON.stringify(data) : "data est null ou undefined"); // Vérifie si data existe avant stringify
  console.log("Contexte d'authentification brut (context.auth):", context.auth ? JSON.stringify(context.auth) : "context.auth est null ou undefined");
  // Optionnel : loguer le contexte complet peut être très verbeux, mais parfois utile
  // console.log("Contexte complet (context):", JSON.stringify(context));

  // Votre vérification existante
  if (!context.auth) {
    console.error("ERREUR DANS setUserAsAdmin: context.auth est manquant. L'utilisateur n'est pas considéré comme authentifié par la fonction."); // LOG MODIFIÉ/AJOUTÉ
    throw new functions.https.HttpsError(
      "unauthenticated",
      "La fonction doit être appelée par un utilisateur authentifié."
    );
  }

  // >> DÉBUT DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<
  // IMPORTANT : Laissez ceci commenté pour l'instant si vous n'avez pas encore réussi à définir votre premier admin.
  // if (context.auth.token.admin !== true) {
  //   console.warn(`Utilisateur non admin (UID: ${context.auth.uid}, Claims: ${JSON.stringify(context.auth.token)}) a tenté de définir un rôle admin.`); // LOG AJOUTÉ
  //   throw new functions.https.HttpsError(
  //     "permission-denied",
  //     "Seul un administrateur peut assigner des rôles d'administrateur."
  //   );
  // }
  // >> FIN DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<

  const targetUserUID = data.uid;
  const isAdminStatus = data.isAdmin;

  if (!targetUserUID || typeof isAdminStatus !== "boolean") {
    console.error("ERREUR dans setUserAsAdmin: Arguments invalides reçus. data.uid:", targetUserUID, "data.isAdmin:", isAdminStatus); // LOG MODIFIÉ/AJOUTÉ
    throw new functions.https.HttpsError(
      "invalid-argument",
      "L'UID de l'utilisateur cible et le statut admin (isAdmin: true/false) sont requis."
    );
  }

  try {
    console.log(`Tentative de définition du claim { admin: ${isAdminStatus} } pour l'UID : ${targetUserUID}`); // LOG EXISTANT
    await admin.auth().setCustomUserClaims(targetUserUID, { admin: isAdminStatus });
    console.log(`Custom claim défini avec succès pour l'UID : ${targetUserUID}`); // LOG EXISTANT

    await admin
      .firestore()
      .collection("users")
      .doc(targetUserUID)
      .set({ role: isAdminStatus ? "admin" : "user" }, { merge: true });
    console.log(`Rôle Firestore mis à jour pour l'UID : ${targetUserUID}`); // LOG EXISTANT

    return {
      message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`,
    };
  } catch (error) {
    console.error("Erreur interne lors de la définition du custom claim ou de la mise à jour Firestore : ", error); // LOG EXISTANT
    throw new functions.https.HttpsError(
      "internal",
      "Erreur interne lors de la définition du rôle."
    );
  }
});