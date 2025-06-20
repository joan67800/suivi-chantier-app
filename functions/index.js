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

exports.setUserAsAdmin = onRequest(async (request, response) => {
    const cors = require("cors")({ origin: true });
    cors(request, response, async () => {
        if (!request.headers.authorization || !request.headers.authorization.startsWith("Bearer ")) {
            return response.status(403).send("Unauthorized");
        }
        try {
            const idToken = request.headers.authorization.split("Bearer ")[1];
            const decodedIdToken = await admin.auth().verifyIdToken(idToken);
            if (decodedIdToken.admin !== true) {
                return response.status(403).send("Permission Denied: Must be an administrator.");
            }

            const { uid, isAdmin } = request.body.data;
            if (!uid || typeof isAdmin !== "boolean") {
                return response.status(400).send("Bad Request: UID et isAdmin sont requis.");
            }

            await admin.auth().setCustomUserClaims(uid, { admin: isAdmin });
            await admin.firestore().collection("clients").doc(uid).set({ role: isAdmin ? "admin" : "user" }, { merge: true });

            return response.status(200).send({ data: { message: `Rôle de l'utilisateur ${uid} mis à jour.` } });
        } catch (error) {
            console.error("Erreur lors de la définition du rôle :", error);
            return response.status(500).send("Internal Server Error");
        }
    });
});


// MODIFIÉ: Ajout de la conversion du numéro de téléphone au format E.164
exports.createClientUser = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError("permission-denied", "Seul un administrateur peut créer un client.");
    }

    const { email, password, nom, telephone, adresse } = request.data;
    if (!email || !password || !nom) {
        throw new functions.https.HttpsError("invalid-argument", "Email, password, et nom sont requis.");
    }
    if (password.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "Le mot de passe doit faire au moins 6 caractères.");
    }

    // --- DÉBUT DE LA MODIFICATION ---
    let formattedPhoneNumber;
    if (telephone) {
        // Supprime les espaces et autres caractères non numériques, sauf le '+' initial
        let cleanedPhone = telephone.replace(/[\s-()]/g, '');
        // Si le numéro commence par 0, on le remplace par +33
        if (cleanedPhone.startsWith('0')) {
            formattedPhoneNumber = `+33${cleanedPhone.substring(1)}`;
        } else {
            formattedPhoneNumber = cleanedPhone; // On suppose qu'il est déjà dans un format international
        }
    }
    // --- FIN DE LA MODIFICATION ---

    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: nom,
            // On utilise le numéro formaté. S'il est vide, on passe `undefined`.
            phoneNumber: formattedPhoneNumber || undefined
        });
        
        await admin.firestore().collection('clients').doc(userRecord.uid).set({
            nom: nom,
            email: email,
            telephone: telephone || '',
            adresse: adresse || ''
        });
        
        return { message: `Le client '${nom}' a été créé avec succès.` };

    } catch (error) {
        console.error("Erreur lors de la création du client :", error);
        if (error.code === 'auth/invalid-phone-number') {
             throw new functions.https.HttpsError('invalid-argument', 'Le format du numéro de téléphone est invalide.');
        }
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Cet email est déjà utilisé.');
        }
        throw new functions.https.HttpsError("internal", "Erreur interne lors de la création du client.");
    }
});


exports.deleteClient = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError("permission-denied", "Seul un administrateur peut supprimer un client.");
    }

    const clientId = request.data.clientId;
    if (!clientId) {
        throw new functions.https.HttpsError("invalid-argument", "L'ID du client est manquant.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const clientRef = db.collection("clients").doc(clientId);

    try {
        const chantiersSnapshot = await clientRef.collection("chantier").get();

        if (!chantiersSnapshot.empty) {
            for (const chantierDoc of chantiersSnapshot.docs) {
                const chantierId = chantierDoc.id;
                const photoPrefix = `chantier-photos/${chantierId}/`;
                const documentPrefix = `chantier-documents/${chantierId}/`;

                await bucket.deleteFiles({ prefix: photoPrefix });
                await bucket.deleteFiles({ prefix: documentPrefix });
            }
        }

        await db.recursiveDelete(clientRef);
        await admin.auth().deleteUser(clientId);

        return { success: true, message: `Le client ${clientId} a été supprimé.` };
    } catch (error) {
        console.error(`Erreur suppression du client ${clientId}:`, error);
        throw new functions.https.HttpsError("internal", "Erreur interne lors de la suppression du client.");
    }
});

exports.deleteChantier = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError("permission-denied", "Seul un administrateur peut supprimer un chantier.");
    }

    const { clientId, chantierId } = request.data;
    if (!clientId || !chantierId) {
        throw new functions.https.HttpsError("invalid-argument", "IDs client et chantier manquants.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const chantierRef = db.collection("clients").doc(clientId).collection("chantier").doc(chantierId);

    try {
        const photoPrefix = `chantier-photos/${chantierId}/`;
        const documentPrefix = `chantier-documents/${chantierId}/`;

        await bucket.deleteFiles({ prefix: photoPrefix });
        await bucket.deleteFiles({ prefix: documentPrefix });

        await db.recursiveDelete(chantierRef);

        return { success: true, message: `Le chantier ${chantierId} a été supprimé.` };

    } catch (error) {
        console.error(`Erreur suppression du chantier ${chantierId}:`, error);
        throw new functions.https.HttpsError("internal", "Erreur interne lors de la suppression du chantier.");
    }
});