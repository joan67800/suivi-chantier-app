const functions = require("firebase-functions");
const admin = require("firebase-admin");

// IMPORTS pour les fonctions v2
const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

// ==========================================================
// VOS FONCTIONS
// ==========================================================

// MODIFIÉ : Passage de onRequest à onCall pour la cohérence et la sécurité
exports.setUserAsAdmin = onCall(async (request) => {
    // 1. Vérifie que l'appelant est bien un administrateur
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Action non autorisée. Seul un administrateur peut modifier les rôles."
        );
    }

    // 2. Valide les données reçues
    const { targetUid, isAdmin } = request.data;
    if (!targetUid || typeof isAdmin !== 'boolean') {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "L'UID de la cible et le statut 'isAdmin' (true/false) sont requis."
        );
    }

    try {
        // 3. Définit le "custom claim" pour le rôle admin sur le compte utilisateur
        await admin.auth().setCustomUserClaims(targetUid, { admin: isAdmin });
        
        // 4. Met à jour le document dans Firestore pour refléter le rôle
        const role = isAdmin ? "admin" : "user";
        await admin.firestore().collection("clients").doc(targetUid).set({ role: role }, { merge: true });

        // 5. Renvoie un message de succès
        return { message: `Succès ! Le rôle de l'utilisateur ${targetUid} est maintenant : ${role}.` };

    } catch (error) {
        console.error("Erreur lors de la définition du rôle :", error);
        throw new functions.https.HttpsError("internal", "Une erreur est survenue lors de la mise à jour du rôle.");
    }
});


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

    let formattedPhoneNumber;
    if (telephone) {
        let cleanedPhone = telephone.replace(/[\s-()]/g, '');
        if (cleanedPhone.startsWith('0')) {
            formattedPhoneNumber = `+33${cleanedPhone.substring(1)}`;
        } else {
            formattedPhoneNumber = cleanedPhone;
        }
    }

    try {
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: nom,
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