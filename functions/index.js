const functions = require("firebase-functions");
const admin = require("firebase-admin");

// IMPORTS pour les fonctions v2
const { onRequest } = require("firebase-functions/v2/https");
const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

// ==========================================================
// VOS FONCTIONS
// ==========================================================

// Note : Cette fonction est de type onRequest. Pour la cohérence, elle pourrait être migrée en onCall.
exports.setUserAsAdmin = onRequest(async (request, response) => {
    // La fonction onRequest nécessite l'utilisation du module cors
    const cors = require("cors")({ origin: true });
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

            await admin.auth().setCustomUserClaims(targetUserUID, { admin: isAdminStatus });
            // MODIFIÉ : Cible la collection 'clients' au lieu de 'users' pour la cohérence
            await admin.firestore().collection("clients").doc(targetUserUID).set({ role: isAdminStatus ? "admin" : "user" }, { merge: true });

            return response.status(200).send({ data: { message: `Succès ! L'utilisateur ${targetUserUID} a maintenant le statut admin: ${isAdminStatus}.` } });
        } catch (error) {
            console.error("Erreur lors de la définition du rôle :", error);
            return response.status(403).send("Unauthorized");
        }
    });
});

// MODIFIÉ : Changement de onRequest vers onCall pour la simplicité et sécurité
exports.createClientUser = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Action non autorisée. Seul un administrateur peut créer un client."
        );
    }

    const { email, password, nom } = request.data;
    if (!email || !password || !nom) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Les champs 'email', 'password' et 'nom' sont requis."
        );
    }
    if (password.length < 6) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Le mot de passe doit faire au moins 6 caractères."
        );
    }

    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: nom,
        });

        await admin.firestore().collection('clients').doc(userRecord.uid).set({
            nom: nom,
            email: email
        });

        return { message: `Le client '${nom}' a été créé avec succès.` };
    } catch (error) {
        console.error("Erreur lors de la création du client :", error);
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Cet email est déjà utilisé par un autre compte.');
        }
        throw new functions.https.HttpsError("internal", "Une erreur interne est survenue lors de la création du client.");
    }
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

        if (!chantiersSnapshot.empty) {
            console.log(`Début de la suppression du stockage pour les chantiers du client ${clientId}.`);
            for (const chantierDoc of chantiersSnapshot.docs) {
                const chantierId = chantierDoc.id;
                // MODIFIÉ : Ajout de la suppression des documents en plus des photos
                const photoPrefix = `chantier-photos/${chantierId}/`;
                const documentPrefix = `chantier-documents/${chantierId}/`;

                await bucket.deleteFiles({ prefix: photoPrefix });
                await bucket.deleteFiles({ prefix: documentPrefix });
                console.log(`Stockage nettoyé pour le chantier ${chantierId}.`);
            }
        }

        await db.recursiveDelete(clientRef);
        console.log(`Document Firestore et sous-collections pour ${clientId} supprimés.`);

        await admin.auth().deleteUser(clientId);
        console.log(`Compte d'authentification supprimé pour : ${clientId}`);

        return { success: true, message: `Le client ${clientId} et toutes ses données ont été supprimés.` };
    } catch (error) {
        console.error(`Erreur lors de la suppression complète du client ${clientId}:`, error);
        throw new functions.https.HttpsError("internal", "Une erreur interne est survenue lors de la suppression du client.");
    }
});

// MODIFIÉ : Mise à jour pour supprimer les documents PDF
exports.deleteChantier = onCall(async (request) => {
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
        // Étape A: Supprimer les dossiers associés dans Storage
        const photoPrefix = `chantier-photos/${chantierId}/`;
        const documentPrefix = `chantier-documents/${chantierId}/`; // NOUVEAU

        await bucket.deleteFiles({ prefix: photoPrefix });
        await bucket.deleteFiles({ prefix: documentPrefix }); // NOUVEAU
        console.log(`Fichiers de Storage (photos et documents) supprimés pour le chantier: ${chantierId}`);

        // Étape B: Supprimer le document du chantier et toutes ses sous-collections
        await db.recursiveDelete(chantierRef);
        console.log(`Document chantier ${chantierId} et ses sous-collections supprimés de Firestore.`);

        return { success: true, message: `Le chantier ${chantierId} a été supprimé.` };

    } catch (error) {
        console.error(`Erreur lors de la suppression du chantier ${chantierId} pour le client ${clientId}:`, error);
        throw new functions.https.HttpsError("internal", "Une erreur interne est survenue lors de la suppression du chantier.");
    }
});