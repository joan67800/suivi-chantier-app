const functions = require("firebase-functions");
const admin = require("firebase-admin");

// NOUVEAUX IMPORTS pour les fonctions v2 (onCall et onRequest)
const { onRequest } = require("firebase-functions/v2/https");
const { onCall } = require("firebase-functions/v2/https"); // <- Pour notre nouvelle fonction
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

const cors = require("cors")({ origin: true });

// ==========================================================
// VOS FONCTIONS EXISTANTES (inchangées)
// ==========================================================

// Fonction existante pour gérer les rôles admin
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

// NOUVELLE FONCTION pour créer un client
exports.createClientUser = onRequest((request, response) => {
  cors(request, response, async () => {
    console.log("--- Début de l'exécution de createClientUser ---");

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
      console.log("Utilisateur créé avec succès dans Auth:", userRecord.uid);
      
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


// ==========================================================
// NOUVELLE FONCTION POUR SUPPRIMER UN CLIENT
// ==========================================================
exports.deleteClient = onCall(async (request) => {
  // 1. Vérification de sécurité : l'appelant est-il authentifié et admin ?
  if (!request.auth || !request.auth.token.admin) {
    throw new functions.https.HttpsError(
        "permission-denied",
        "Action non autorisée. Seul un administrateur peut supprimer un client.",
    );
  }

  const clientId = request.data.clientId;
  if (!clientId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "L'ID du client est manquant dans la requête.",
    );
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const clientPath = `clients/${clientId}`;

  try {
    // 2. Supprimer tous les fichiers du client dans Storage
    // On liste tous ses chantiers pour trouver les dossiers de photos
    const chantiersSnapshot = await db.collection(clientPath).doc("chantier").collection("chantiers").get();
    
    for (const chantierDoc of chantiersSnapshot.docs) {
      const chantierId = chantierDoc.id;
      const prefix = `chantier-photos/${chantierId}/`;
      // Suppression de tous les fichiers dans le dossier du chantier
      await bucket.deleteFiles({ prefix: prefix });
      console.log(`Fichiers de Storage supprimés pour le chantier: ${chantierId}`);
    }

    // 3. Supprimer tous les documents et sous-collections dans Firestore
    // Firebase a une fonction pour cela dans la CLI, mais dans les fonctions,
    // nous devons le faire manuellement pour être sûr. La méthode la plus
    // simple et sécurisée est de le faire via la console ou un script,
    // mais pour une suppression complète ici, on cible le document principal
    // (après avoir géré les fichiers, la partie la plus critique).
    // Une suppression récursive complète serait beaucoup plus complexe.
    // Pour notre cas, supprimer les fichiers, le compte Auth et le doc client est le 80/20.
    
    // Pour une suppression complète, on peut utiliser cette logique de suppression récursive
    // (plus avancée mais plus propre)
    await db.recursiveDelete(db.collection('clients').doc(clientId));
    console.log(`Document Firestore et toutes les sous-collections pour ${clientId} supprimés.`);

    // 4. Supprimer le compte d'authentification de l'utilisateur
    await admin.auth().deleteUser(clientId);
    console.log(`Compte d'authentification supprimé pour: ${clientId}`);

    return { success: true, message: `Le client ${clientId} et toutes ses données ont été supprimés.` };

  } catch (error) {
    console.error(`Erreur lors de la suppression complète du client ${clientId}:`, error);
    throw new functions.https.HttpsError(
        "internal",
        "Une erreur est survenue lors de la suppression du client.",
        error.message
    );
  }
});