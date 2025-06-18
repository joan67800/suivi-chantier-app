const admin = require("firebase-admin");
const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({region: "us-central1"});

const cors = require("cors")({origin: true});

// Fonction existante pour gérer les rôles admin (inchangée dans sa logique)
exports.setUserAsAdmin = onRequest((request, response) => {
  cors(request, response, async () => {
    if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
      console.error("Aucun jeton Firebase ID n'a été fourni dans la requête.");
      response.status(403).send("Unauthorized");
      return;
    }
    try {
      const idToken = request.headers.authorization.split("Bearer ")[1];
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.admin !== true) {
        console.warn(`Tentative non autorisée par l'UID: ${decodedIdToken.uid}`);
        response.status(403).send("Permission Denied: Must be an administrator to assign roles.");
        return;
      }
      const targetUserUID = request.body.data.uid;
      const isAdminStatus = request.body.data.isAdmin;
      if (!targetUserUID || typeof isAdminStatus !== "boolean") {
        response.status(400).send("Bad Request: UID et isAdmin (boolean) sont requis.");
        return;
      }
      await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});
      await admin.firestore().collection("users").doc(targetUserUID).set({role: isAdminStatus ? "admin" : "user"}, {merge: true});
      response.status(200).send({data: {message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`}});
    } catch (error) {
      console.error("Erreur lors de la définition du rôle :", error);
      response.status(403).send("Unauthorized");
    }
  });
});

// NOUVELLE FONCTION pour créer un client (inchangée dans sa logique)
exports.createClientUser = onRequest((request, response) => {
  cors(request, response, async () => {
    if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
      console.error("Aucun jeton Firebase ID n'a été fourni.");
      return response.status(403).send("Unauthorized");
    }
    try {
      const idToken = request.headers.authorization.split("Bearer ")[1];
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.admin !== true) {
        console.warn(`Tentative de création de client non autorisée par l'UID: ${decodedIdToken.uid}`);
        return response.status(403).send("Permission Denied: Must be an administrator.");
      }
      const { email, password, nom } = request.body.data;
      if (!email || !password || !nom) {
        return response.status(400).send("Bad Request: Email, password, et nom sont requis.");
      }
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: nom,
      });
      await admin.firestore().collection('clients').doc(userRecord.uid).set({
        nom: nom,
        email: email
      });
      return response.status(200).send({ data: { message: `Client '${nom}' créé avec succès.` } });
    } catch (error) {
      const errorMessage = error.code === 'auth/email-already-exists' 
        ? "Cet email est déjà utilisé." 
        : "Erreur interne lors de la création du client.";
      return response.status(500).send(errorMessage);
    }
  });
});