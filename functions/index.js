const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

// IMPORTS pour les fonctions v2
const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

// Initialisation de SendGrid
const SENDGRID_API_KEY = functions.config().sendgrid.key;
sgMail.setApiKey(SENDGRID_API_KEY);

// ==========================================================
// CONFIGURATION DES E-MAILS
// ==========================================================
// MODIFIÉ : Utilisation de votre adresse de domaine authentifiée comme expéditeur
const APP_SENDER_EMAIL = "mail@2-hr-habitatrenovation.fr"; 
const ADMIN_EMAIL = "joanw.2hr@gmail.com"; // Votre adresse de réception
// ==========================================================


// ==========================================================
// FONCTIONS DE NOTIFICATION
// ==========================================================

/**
 * Se déclenche à la création d'un nouveau message dans le chat.
 * Avertit l'admin si le client écrit, et le client si l'admin répond.
 */
exports.notifyOnNewMessage = functions.firestore
    .document('clients/{clientId}/chantier/{chantierId}/messages/{messageId}')
    .onCreate(async (snap, context) => {
        const messageData = snap.data();
        const { clientId, chantierId } = context.params;

        try {
            const chantierDoc = await admin.firestore().doc(`clients/${clientId}/chantier/${chantierId}`).get();
            const clientDoc = await admin.firestore().doc(`clients/${clientId}`).get();
            
            if (!chantierDoc.exists || !clientDoc.exists) {
                console.log("Document client ou chantier non trouvé.");
                return null;
            }
            
            const chantierInfo = chantierDoc.data();
            const clientInfo = clientDoc.data();
            const appUrl = "https://suividechantier2hr.netlify.app/";

            let mailOptions;

            // Si le message vient de l'admin, on notifie le client
            if (messageData.senderId !== clientId) { 
                mailOptions = {
                    to: clientInfo.email,
                    from: APP_SENDER_EMAIL,
                    subject: `Nouvelle réponse sur votre chantier : ${chantierInfo.adresse}`,
                    html: `<p>Bonjour ${clientInfo.nom},</p><p>Vous avez reçu une nouvelle réponse de notre part concernant votre chantier situé à ${chantierInfo.adresse}.</p><p><strong>Message :</strong> "${messageData.text}"</p><p>Pour consulter le suivi complet, connectez-vous à votre espace :</p><a href="${appUrl}">Accéder à mon espace client</a><p>Cordialement,<br>L'équipe 2HR Habitat Rénovation</p>`
                };
            } 
            // Si le message vient du client, on notifie l'admin
            else {
                mailOptions = {
                    to: ADMIN_EMAIL,
                    from: APP_SENDER_EMAIL,
                    subject: `Nouvelle question client : ${clientInfo.nom}`,
                    html: `<p>Une nouvelle question a été posée par le client <strong>${clientInfo.nom}</strong>.</p><p><strong>Chantier :</strong> ${chantierInfo.adresse}</p><p><strong>Question :</strong> "${messageData.text}"</p><a href="${appUrl}">Accéder à l'espace Admin</a>`
                };
            }
            
            await sgMail.send(mailOptions);
            console.log("Email de notification envoyé avec succès !");

        } catch (error) {
            console.error("Erreur lors de l'envoi de l'email de notification:", error);
        }
        return null;
    });

/**
 * Se déclenche à l'ajout d'une nouvelle photo sur un chantier.
 * Avertit le client concerné.
 */
exports.notifyOnNewPhoto = functions.firestore
    .document('clients/{clientId}/chantier/{chantierId}')
    .onUpdate(async (change, context) => {
        const dataBefore = change.before.data();
        const dataAfter = change.after.data();

        // On vérifie si une photo a été ajoutée
        if (dataBefore.photos.length < dataAfter.photos.length) {
            const { clientId } = context.params;

            try {
                const clientDoc = await admin.firestore().doc(`clients/${clientId}`).get();
                if (!clientDoc.exists) return null;

                const clientInfo = clientDoc.data();
                const chantierInfo = dataAfter; 
                const appUrl = "https://suividechantier2hr.netlify.app/";

                const mailOptions = {
                    to: clientInfo.email,
                    from: APP_SENDER_EMAIL,
                    subject: `Nouvelles photos de votre chantier : ${chantierInfo.adresse}`,
                    html: `<p>Bonjour ${clientInfo.nom},</p><p>De nouvelles photos de l'avancement de votre chantier à ${chantierInfo.adresse} ont été ajoutées.</p><p>Connectez-vous à votre espace pour les découvrir :</p><a href="${appUrl}">Voir les nouvelles photos</a><p>Cordialement,<br>L'équipe 2HR Habitat Rénovation</p>`
                };

                await sgMail.send(mailOptions);
                console.log("Email de notification de nouvelle photo envoyé !");

            } catch (error) {
                console.error("Erreur lors de l'envoi de l'email (nouvelle photo):", error);
            }
        }
        return null;
    });

// ==========================================================
// AUTRES FONCTIONS DE GESTION
// ==========================================================

exports.setUserAsAdmin = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new functions.https.HttpsError("permission-denied", "Action non autorisée.");
    }
    const { targetUid, isAdmin } = request.data;
    if (!targetUid || typeof isAdmin !== 'boolean') {
        throw new functions.https.HttpsError("invalid-argument", "UID et statut isAdmin requis.");
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { admin: isAdmin });
        const role = isAdmin ? "admin" : "user";
        await admin.firestore().collection("clients").doc(targetUid).set({ role: role }, { merge: true });
        return { message: `Succès ! Le rôle de l'utilisateur ${targetUid} est : ${role}.` };
    } catch (error) {
        throw new functions.https.HttpsError("internal", "Erreur lors de la mise à jour du rôle.");
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
                await bucket.deleteFiles({ prefix: `chantier-photos/${chantierId}/` });
                await bucket.deleteFiles({ prefix: `chantier-documents/${chantierId}/` });
            }
        }
        await db.recursiveDelete(clientRef);
        await admin.auth().deleteUser(clientId);
        return { success: true, message: `Le client ${clientId} a été supprimé.` };
    } catch (error) {
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
        await bucket.deleteFiles({ prefix: `chantier-photos/${chantierId}/` });
        await bucket.deleteFiles({ prefix: `chantier-documents/${chantierId}/` });
        await db.recursiveDelete(chantierRef);
        return { success: true, message: `Le chantier ${chantierId} a été supprimé.` };
    } catch (error) {
        throw new functions.https.HttpsError("internal", "Erreur interne lors de la suppression du chantier.");
    }
});