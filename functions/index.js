const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

// Fonction existante pour gérer les rôles admin (inchangée)
exports.setUserAsAdmin = functions.https.onRequest((request, response) => {
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

// NOUVELLE FONCTION pour créer un client
exports.createClientUser = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    console.log("--- Début de l'exécution de createClientUser ---");

    // 1. Vérifier que l'appelant est un admin authentifié
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

      // 2. Récupérer les données du nouveau client
      const { email, password, nom } = request.body.data;
      if (!email || !password || !nom) {
        console.error("Données manquantes: email, password, ou nom.");
        return response.status(400).send("Bad Request: Email, password, et nom sont requis.");
      }

      // 3. Créer l'utilisateur dans Firebase Authentication
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: nom,
      });
      console.log("Utilisateur créé avec succès dans Auth:", userRecord.uid);
      
      // 4. Créer le document correspondant dans la collection 'clients' de Firestore
      await admin.firestore().collection('clients').doc(userRecord.uid).set({
        nom: nom,
        email: email
      });
      console.log("Document client créé avec succès dans Firestore pour:", userRecord.uid);
      
      return response.status(200).send({ data: { message: `Client '${nom}' créé avec succès.` } });

    } catch (error) {
      console.error("Erreur lors de la création du client :", error);
      const errorMessage = error.code === 'auth/email-already-exists' 
        ? "Cet email est déjà utilisé." 
        : "Erreur interne lors de la création du client.";
      return response.status(500).send(errorMessage);
    }
  });
});
