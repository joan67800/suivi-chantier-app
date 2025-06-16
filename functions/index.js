const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

// Version HTTP (onRequest) sécurisée
exports.setUserAsAdmin = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    console.log("--- Début de l'exécution de la fonction HTTP setUserAsAdmin ---");

    if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
      console.error("Aucun jeton Firebase ID n'a été fourni dans la requête.");
      response.status(403).send("Unauthorized");
      return;
    }

    try {
      const idToken = request.headers.authorization.split("Bearer ")[1];
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      console.log("Jeton ID vérifié avec succès. UID de l'appelant:", decodedIdToken.uid);

      // ===================================================================
      // == DÉBUT DU BLOC DE SÉCURITÉ À AJOUTER ==
      // On vérifie ici si l'utilisateur qui appelle la fonction est bien un admin.
      // Cette vérification lit le claim 'admin' du jeton que nous venons de vérifier.
      if (decodedIdToken.admin !== true) {
        console.warn(`Tentative d'appel non autorisée par l'UID: ${decodedIdToken.uid}`);
        response.status(403).send("Permission Denied: Must be an administrator to assign roles.");
        return; // Important : arrêter l'exécution ici.
      }
      // == FIN DU BLOC DE SÉCURITÉ À AJOUTER ==
      // ===================================================================

      const targetUserUID = request.body.data.uid;
      const isAdminStatus = request.body.data.isAdmin;

      console.log("Données reçues : UID Cible =", targetUserUID, ", Statut Admin =", isAdminStatus);

      if (!targetUserUID || typeof isAdminStatus !== "boolean") {
        console.error("Arguments invalides reçus.");
        response.status(400).send("Bad Request: UID et isAdmin (boolean) sont requis.");
        return;
      }

      await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});
      console.log("SUCCÈS : Custom claim défini.");

      await admin.firestore().collection("users").doc(targetUserUID).set({role: isAdminStatus ? "admin" : "user"}, {merge: true});
      console.log("SUCCÈS : Firestore mis à jour.");

      console.log("--- Fin de l'exécution (Succès) ---");
      response.status(200).send({data: {message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`}});

    } catch (error) {
      console.error("Erreur lors de la vérification du jeton ou de l'exécution de la logique :", error);
      response.status(403).send("Unauthorized");
      return;
    }
  });
});
