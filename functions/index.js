const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialise l'application Firebase Admin SDK.
admin.initializeApp();

/**
 * Fonction appelable pour définir un utilisateur comme admin.
 * Pour appeler cette fonction, l'appelant DOIT déjà être un admin
 * (vérifié par un custom claim 'admin' sur son propre jeton).
 * Ou, pour la première fois, vous (le propriétaire du projet) devrez trouver un moyen
 * de définir votre propre compte comme admin (voir note plus bas).
 */
// ATTENTION : `.runWith` est supprimé temporairement pour le test
exports.setUserAsAdmin = functions.https.onCall(async (data, context) => {
  // Vérifier si l'utilisateur qui appelle cette fonction est authentifié
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "La fonction doit être appelée par un utilisateur authentifié.",
    );
  }

  // >> DÉBUT DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<
  // IMPORTANT : Pour le tout premier admin, cette vérification est commentée.
  // Décommentez-la IMMÉDIATEMENT après avoir défini votre premier admin
  // et redéployez la fonction !
  // if (context.auth.token.admin !== true) {
  //   console.warn(`Utilisateur non admin (UID: ${context.auth.uid}) a tenté de définir un rôle admin.`);
  //   throw new functions.https.HttpsError(
  //       "permission-denied",
  //       "Seul un administrateur peut assigner des rôles d'administrateur.",
  //   );
  // }
  // >> FIN DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<

  const targetUserUID = data.uid; // L'UID de l'utilisateur à qui on veut donner le rôle admin
  const isAdminStatus = data.isAdmin; // true pour donner le rôle, false pour l'enlever

  if (!targetUserUID || typeof isAdminStatus !== "boolean") {
    throw new new functions.https.HttpsError(
        "invalid-argument",
        "L'UID de l'utilisateur cible et le statut admin (isAdmin: true/false) sont requis.",
    );
  }

  try {
    // Définir (ou enlever) le custom claim 'admin' pour l'utilisateur cible
    await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});

    // Optionnel : Mettre à jour aussi la base de données Firestore pour la cohérence
    // Cela n'est plus nécessaire pour les règles de sécurité si elles utilisent les claims,
    // mais peut être utile pour votre application si elle lit le rôle depuis Firestore.
    await admin
        .firestore()
        .collection("users")
        .doc(targetUserUID)
        .set({role: isAdminStatus ? "admin" : "user"}, {merge: true}); // 'user' ou un autre rôle par défaut

    return {
      message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`,
    };
  } catch (error) {
    console.error("Erreur lors de la définition du custom claim : ", error);
    throw new functions.https.HttpsError(
        "internal",
        "Erreur interne lors de la définition du rôle.",
    );
  }
});