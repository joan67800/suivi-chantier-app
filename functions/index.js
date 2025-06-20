const functions = require("firebase-functions");
const admin = require("firebase-admin");

// IMPORTS pour les fonctions v2
const { onRequest } = require("firebase-functions/v2/https");
const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

const cors = require("cors")({ origin: true });

// ==========================================================
// VOS FONCTIONS EXISTANTES
// ==========================================================

exports.setUserAsAdmin = onRequest((request, response) => {
  cors(request, response, async () => {
    if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
      console.error("Aucun jeton Firebase ID n'a été fourni dans la requête setUserAsAdmin.");
      return response.status(403).send("Unauthorized");
    }
    try {
      const idToken = request.headers.authorization.split("Bearer ")[1];
      const decodedIdToken = await admin.auth().verifyIdToken(idToken);
      if (decodedIdToken.admin !== true) {
        console.warn(`Tentative non autorisée par l'UID: ${decodedIdToken.uid}`);
        return response.status(403).send("Permission Denied: Must be an administrator to assign roles.");
      }
      
      const targetUserUID = request.body.data.uid;
      const isAdminStatus = request.body.data.isAdmin;
      if (!targetUserUID || typeof isAdminStatus !== "boolean") {
        return response.status(400).send("Bad Request: UID et isAdmin (boolean) sont requis.");
      }
      
      await admin.auth().setCustomUserClaims(targetUserUID, {admin: isAdminStatus});
      await admin.firestore().collection("users").doc(targetUserUID).set({role: isAdminStatus ? "admin" : "user"}, {merge: true});
      
      return response.status(200).send({data: {message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.`}});
    } catch (error) {
      console.error("Erreur lors de la définition du rôle :", error);
      return response.status(403).send("Unauthorized");
    }
  });
});

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
      console.error("Erreur lors de la création du client :", error);
      const errorMessage = error.code === 'auth/email-already-exists' 
        ? "Cet email est déjà utilisé." 
        : "Erreur interne lors de la création du client.";
      return response.status(500).send(errorMessage);
    }
  });
});

exports.deleteClient = onCall(async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Action non autorisée. Seul un administrateur peut supprimer un client."
    );
  }

  const clientId = request.data.clientId;
  if (!clientId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "L'ID du client est manquant dans la requête."
    );
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const clientRef = db.collection("clients").doc(clientId);

  try {
    const chantiersSnapshot = await clientRef.collection("chantier").get();
    
    const deleteStoragePromises = [];
    if (!chantiersSnapshot.empty) {
        for (const chantierDoc of chantiersSnapshot.docs) {
          const chantierId = chantierDoc.id;
          const prefix = `chantier-photos/${chantierId}/`;
          deleteStoragePromises.push(bucket.deleteFiles({ prefix: prefix }));
        }
        await Promise.all(deleteStoragePromises);
        console.log(`Tous les fichiers de Storage pour le client ${clientId} ont été traités.`);
    }

    await db.recursiveDelete(clientRef);
    console.log(`Document Firestore et sous-collections pour ${clientId} supprimés.`);

    await admin.auth().deleteUser(clientId);
    console.log(`Compte d'authentification supprimé pour : ${clientId}`);

    return { success: true, message: `Le client ${clientId} et toutes ses données ont été supprimés.` };
  } catch (error) {
    console.error(`Erreur lors de la suppression complète du client ${clientId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Une erreur interne est survenue lors de la suppression du client.",
      error.message
    );
  }
});


// ==========================================================
// NOUVELLE FONCTION POUR SUPPRIMER UN CHANTIER
// ==========================================================
exports.deleteChantier = onCall(async (request) => {
  // 1. Sécurité : vérifier que l'appelant est un admin
  if (!request.auth || !request.auth.token.admin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Action non autorisée. Seul un administrateur peut supprimer un chantier."
    );
  }

  const { clientId, chantierId } = request.data;
  if (!clientId || !chantierId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Les IDs du client et du chantier sont manquants."
    );
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const chantierRef = db.collection("clients").doc(clientId).collection("chantier").doc(chantierId);

  try {
    // Étape A: Supprimer le dossier de photos associé dans Storage
    const prefix = `chantier-photos/${chantierId}/`;
    await bucket.deleteFiles({ prefix: prefix });
    console.log(`Fichiers de Storage supprimés pour le chantier: ${chantierId}`);

    // Étape B: Supprimer le document du chantier et toutes ses sous-collections (messages)
    await db.recursiveDelete(chantierRef);
    console.log(`Document chantier ${chantierId} et ses sous-collections supprimés de Firestore.`);

    return { success: true, message: `Le chantier ${chantierId} a été supprimé.` };

  } catch (error) {
    console.error(`Erreur lors de la suppression du chantier ${chantierId} pour le client ${clientId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "Une erreur interne est survenue lors de la suppression du chantier.",
      error.message
    );
  }
});