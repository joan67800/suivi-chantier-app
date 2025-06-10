// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Ajout de CORS pour autoriser les appels depuis votre application web
const cors = require("cors")({origin: true});

admin.initializeApp();

// On passe d'une fonction onCall à une fonction onRequest (HTTP standard)
exports.setUserAsAdmin = functions.https.onRequest((request, response) => {
  // On utilise le middleware CORS pour gérer les autorisations
  cors(request, response, async () => {
    console.log("--- Début de l'exécution de la fonction HTTP setUserAsAdmin ---");

    // Sécurisation manuelle de la fonction HTTP
    // On vérifie que le header d'autorisation existe et commence par "Bearer "
    if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
      console.error("Aucun jeton Firebase ID n'a été fourni dans la requête.");
      response.status(403).send("Unauthorized");
      return;
    }

    let idToken;
    try {
      // On extrait le jeton de l'en-tête
      idToken = request.headers.authorization.split("Bearer ")[1];
      // On vérifie la validité du jeton avec le SDK Admin
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      console.log("Jeton ID vérifié avec succès. UID de l'appelant:", decodedIdToken.uid);

      // Le reste de la logique est similaire, mais on utilise les données de la requête (request.body)
      const targetUserUID = request.body.data.uid;
      const isAdminStatus = request.body.data.isAdmin;

      console.log("Données reçues : UID Cible =", targetUserUID, ", Statut Admin =", isAdminStatus);

      if (!targetUserUID || typeof isAdminStatus !== "boolean") {
        console.error("Arguments invalides reçus.");
        response.status(400).send("Bad Request: UID et isAdmin (boolean) sont requis.");
        return;
      }

      // Définition du claim
      await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});
      console.log("SUCCÈS : Custom claim défini.");

      // Mise à jour de Firestore
      await admin.firestore().collection("users").doc(targetUserUID).set({role: isAdminStatus ? "admin" : "user"}, {merge: true});
      console.log("SUCCÈS : Firestore mis à jour.");
      
      console.log("--- Fin de l'exécution (Succès) ---");
      // On renvoie une réponse de succès au format attendu par le client Functions
      response.status(200).send({data: {message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`}});
    } catch (error) {
      console.error("Erreur lors de la vérification du jeton ou de l'exécution de la logique :", error);
      response.status(403).send("Unauthorized");
      return;
    }
  });
});