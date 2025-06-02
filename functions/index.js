// Ajout des importations nécessaires et de l'initialisation d'admin au tout début du fichier
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(); // Initialise le SDK Admin pour que les autres commandes admin (auth, firestore) fonctionnent

// Votre code de fonction commence ici
exports.setUserAsAdmin = functions.https.onCall(async (data, context) => {
  console.log("Fonction setUserAsAdmin appelée.");
  console.log("Données reçues (data):", data ? JSON.stringify(data) : "data est null ou undefined");

  // Loguons context.auth de manière plus sûre et sélective
  if (context.auth) {
    console.log("UID de l'appelant (context.auth.uid):", context.auth.uid); // Log direct de l'UID
    if (context.auth.token) {
      console.log("Claim 'admin' du jeton (context.auth.token.admin):", context.auth.token.admin);
      console.log("Claim 'email' du jeton (context.auth.token.email):", context.auth.token.email);
      // Vous pouvez ajouter d'autres console.log pour des claims spécifiques si besoin :
      // console.log("Autre claim (context.auth.token.autreClaim):", context.auth.token.autreClaim);
    } else {
      console.log("context.auth.token est null ou undefined.");
    }
  } else {
    console.log("Contexte d'authentification (context.auth): est null ou undefined");
  }

  // La ligne suivante causait une erreur de structure circulaire, elle reste commentée :
  // console.log("Contexte complet (context):", JSON.stringify(context));

  if (!context.auth) {
    console.error("ERREUR DANS setUserAsAdmin: context.auth est manquant.");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "La fonction doit être appelée par un utilisateur authentifié."
    );
  }

  // >> DÉBUT DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<
  // IMPORTANT : Laissez ceci commenté pour l'instant si vous n'avez pas encore réussi à définir votre premier admin.
  // Si vous avez DÉJÀ un admin avec le claim {admin: true} et que vous êtes connecté avec ce compte pour appeler la fonction,
  // vous pouvez décommenter ce bloc pour sécuriser la fonction.
  // if (context.auth.token.admin !== true) {
  //   console.warn(`Utilisateur non admin (UID: ${context.auth.uid}, Claims: ${JSON.stringify(context.auth.token)}) a tenté de définir un rôle admin.`);
  //   throw new functions.https.HttpsError(
  //     "permission-denied",
  //     "Seul un administrateur peut assigner des rôles d'administrateur."
  //   );
  // }
  // >> FIN DU BLOC TEMPORAIREMENT COMMENTÉ POUR LE PREMIER ADMIN <<

  const targetUserUID = data.uid;
  const isAdminStatus = data.isAdmin;

  if (!targetUserUID || typeof isAdminStatus !== "boolean") {
    console.error("ERREUR dans setUserAsAdmin: Arguments invalides reçus. data.uid:", targetUserUID, "data.isAdmin:", isAdminStatus);
    throw new functions.https.HttpsError(
      "invalid-argument",
      "L'UID de l'utilisateur cible et le statut admin (isAdmin: true/false) sont requis."
    );
  }

  try {
    console.log(`Tentative de définition du claim { admin: ${isAdminStatus} } pour l'UID : ${targetUserUID}`);
    await admin.auth().setCustomUserClaims(targetUserUID, { admin: isAdminStatus });
    console.log(`Custom claim défini avec succès pour l'UID : ${targetUserUID}`);

    // Mettre à jour Firestore est optionnel si vous vous basez uniquement sur les claims pour la sécurité,
    // mais utile si votre application lit aussi ce champ 'role'.
    await admin
      .firestore()
      .collection("users")
      .doc(targetUserUID)
      .set({ role: isAdminStatus ? "admin" : "user" }, { merge: true });
    console.log(`Rôle Firestore mis à jour pour l'UID : ${targetUserUID}`);

    return {
      message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`,
    };
  } catch (error) {
    // Ajout de .message et .stack pour plus de détails sur l'erreur potentielle ici
    console.error("Erreur interne lors de la définition du custom claim ou de la mise à jour Firestore : ", error.message, error.stack, error);
    throw new functions.https.HttpsError(
      "internal",
      "Erreur interne lors de la définition du rôle."
    );
  }
});