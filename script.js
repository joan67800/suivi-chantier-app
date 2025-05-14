// Importez getDoc en plus des autres fonctions Firestore
import { getFirestore, collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, updateDoc, arrayUnion, deleteField, getDoc as firebaseGetDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Supprimez la ligne : const ADMIN_UIDS = [...] // Cette ligne a été supprimée dans la version précédente

const questionsContainer = document.getElementById('questions-container'); // Assurez-vous que cet élément existe dans votre HTML
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');

// Instances Firebase (supposées initialisées ailleurs dans index.html)
const auth = window.firebaseAuthInstance;
const db = window.firebaseDbInstance;
const storage = window.firebaseStorageInstance;

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const chantiersList = document.getElementById('chantiers-list');
const logoutButton = document.getElementById('logout-button');
const questionForm = document.getElementById('question-form');
const questionText = document.getElementById('question-text');
const questionConfirmation = document.getElementById('question-confirmation');
const uploadPhotoForm = document.getElementById('upload-photo-form');
const chantierIdInput = document.getElementById('chantier-id');
const photoFileInput = document.getElementById('photo-file');
const uploadStatus = document.getElementById('upload-status');

// --- Fonctions Login / Logout ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Après la connexion réussie, afficher l'application et charger les données
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        loadClientData(userCredential.user.uid); // Passer l'UID à la fonction de chargement
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : ' + error.message;
        loginError.style.display = 'block';
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        // Après la déconnexion réussie, revenir à la page de connexion
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
        // Vider les conteneurs pour l'utilisateur déconnecté
        chantiersList.innerHTML = '';
        questionsContainer.innerHTML = '<p>Chargement des questions...</p>'; // Rétablir le message initial
        adminSection.style.display = 'none';
        adminQuestionsContainer.innerHTML = ''; // Vider aussi les questions admin
    } catch (error) {
        console.error("Erreur lors de la déconnexion : ", error);
    }
});

// --- Fonction de chargement des données et gestion des rôles ---

// Rendre la fonction async car on va faire une requête Firestore (getDoc)
async function loadClientData(uid) {
    const userDocRef = doc(db, 'users', uid); // Référence au document de l'utilisateur dans la collection 'users'
    let isAdmin = false; // Variable pour stocker si l'utilisateur est admin (par défaut : non)

    try {
        const userDocSnap = await firebaseGetDoc(userDocRef); // Récupère le document utilisateur depuis Firestore
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            // Vérifie si le champ 'role' existe et a la valeur 'admin'
            if (userData.role === 'admin') {
                isAdmin = true; // L'utilisateur est un admin
            }
            // Vous pourriez aussi récupérer d'autres données utilisateur ici si besoin
        } else {
            console.warn("Document utilisateur non trouvé dans Firestore pour l'UID :", uid);
            // Gérer le cas où le document 'users' n'existe pas (ex: nouvel utilisateur)
            // Par défaut, si le document n'existe pas ou n'a pas de rôle 'admin', isAdmin reste false
            // Vous pourriez vouloir créer un document user par défaut ici si nécessaire
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du rôle utilisateur depuis Firestore : ", error);
        // En cas d'erreur, on considère l'utilisateur comme non-admin pour des raisons de sécurité
        isAdmin = false;
        // Optionnel : afficher un message d'erreur à l'utilisateur si la récupération du rôle échoue
    }

    // --- Chargement des chantiers spécifiques au client connecté (reste identique) ---
    const chantiersRef = collection(db, 'clients', uid, 'chantier');
    onSnapshot(chantiersRef, (snapshot) => {
        chantiersList.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const chantierData = docSnap.data();
            // Assurez-vous que l'ID du document chantier est disponible si vous en avez besoin plus tard
            const chantierId = docSnap.id;
            const chantierDiv = document.createElement('div');
            chantierDiv.classList.add('chantier-item');
            // Afficher les données du chantier
            chantierDiv.innerHTML = `
                <h3>Chantier à : ${chantierData.adresse}</h3>
                <p>Jours d'intervention : ${chantierData.joursIntervention ? chantierData.joursIntervention.join(', ') : 'Non définis'}</p>
                <p>Avancement : ${chantierData.pourcentageAvancement}%</p>
                <h4>Photos :</h4>
                <div class="photos-container">
                    ${chantierData.photos ? chantierData.photos.map(url => `<img src="${url}" alt="Photo du chantier" width="100">`).join('') : 'Aucune photo pour le moment.'} // <-- Correction appliquée ici
                </div>
            `;
            chantiersList.appendChild(chantierDiv);
        });
    }, (error) => {
        console.error("Erreur lors de la récupération des chantiers : ", error);
        chantiersList.innerHTML = '<p class="error">Erreur lors du chargement de vos chantiers.</p>';
    });

    // Charge les questions posées par l'utilisateur connecté
    loadClientQuestions(uid);

    // --- Logique pour afficher/cacher les sections admin/upload en fonction du rôle ---
    const uploadPhotoContainer = document.getElementById('upload-photo-container'); // Récupérer l'élément upload photo

    if (isAdmin) {
        // Si l'utilisateur est admin
        adminSection.style.display = 'block'; // Affiche la section admin (gestion des questions)
        adminSection.style.borderTop = '2px solid var(--company-orange)'; // Conserve le style de bordure
        uploadPhotoContainer.style.display = 'block'; // Affiche la section d'upload de photos
        loadAdminQuestions(); // Charge toutes les questions pour l'admin
    } else {
        // Si l'utilisateur est un client standard
        adminSection.style.display = 'none'; // Cache la section admin
        uploadPhotoContainer.style.display = 'none'; // Cache la section d'upload de photos
        // Assurez-vous de vider le conteneur des questions admin si un client se connecte
        adminQuestionsContainer.innerHTML = '';
    }
}

// --- Fonction d'envoi de question (reste identique, car c'est une fonction client standard) ---

questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionText.value;
    const user = auth.currentUser;
    if (user && question.trim()) {
        try {
            await setDoc(doc(collection(db, 'questions')), {
                userId: user.uid,
                question: question,
                timestamp: serverTimestamp()
            });
            questionText.value = '';
            questionConfirmation.textContent = 'Votre question a été envoyée.';
            questionConfirmation.style.color = 'green'; // Style success
            questionConfirmation.style.display = 'block';
            setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
        } catch (error) {
            console.error("Erreur lors de l'envoi de la question : ", error);
            questionConfirmation.textContent = 'Erreur lors de l\'envoi de la question.';
            questionConfirmation.style.color = 'red'; // Style error
            questionConfirmation.style.display = 'block';
            // alert("Erreur lors de l'envoi de la question."); // Optionnel: afficher aussi une alerte
        }
    } else if (!question.trim()) {
        // alert("Veuillez saisir une question."); // Laissez l'alerte ou utilisez le même élément de confirmation
        questionConfirmation.textContent = 'Veuillez saisir une question.';
        questionConfirmation.style.color = 'orange'; // Style warning
        questionConfirmation.style.display = 'block';
        setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
    } else {
        console.log("Utilisateur non connecté, impossible d'envoyer la question.");
        // alert("Vous devez être connecté pour poser une question."); // Laissez l'alerte ou utilisez le même élément
        questionConfirmation.textContent = 'Vous devez être connecté pour poser une question.';
        questionConfirmation.style.color = 'red'; // Style error
        questionConfirmation.style.display = 'block';
        setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
    }
});

// --- Fonction d'upload de photo (peut ajouter une vérification isAdmim côté client, mais la sécurité est dans les règles) ---

uploadPhotoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chantierId = chantierIdInput.value;
    const file = photoFileInput.files[0];
    const user = auth.currentUser;

    // Optionnel (pour UI seulement): Vérification côté client si l'utilisateur est admin avant de commencer l'upload
    // La vraie sécurité vient des règles de Storage !
    // Pour que cette vérification client soit possible, vous devriez stocker le rôle utilisateur dans une variable accessible ici,
    // par exemple en la définissant globalement ou en la passant en paramètre.
    // Pour simplifier ici, on se repose sur les règles de Storage pour la sécurité.
    // Vous avez déjà les checks pour l'utilisateur connecté, le fichier et l'ID du chantier.

    if (!user) {
        uploadStatus.textContent = 'Vous devez être connecté pour uploader des photos.';
        uploadStatus.style.color = 'red';
        uploadStatus.style.display = 'block';
        return;
    }
    if (!file) {
        uploadStatus.textContent = 'Veuillez sélectionner un fichier photo.';
        uploadStatus.style.color = 'red';
        uploadStatus.style.display = 'block';
        return;
    }
    if (!chantierId) {
        uploadStatus.textContent = 'Erreur : ID du chantier manquant. Sélectionnez un chantier.';
        uploadStatus.style.color = 'red';
        uploadStatus.style.display = 'block';
        console.error("Erreur : L'ID du chantier est vide ou non défini.");
        return;
    }

    // Référence au chantier spécifique de L'UTILISATEUR CONNECTÉ (même si l'admin upload, il upload POUR un client spécifique)
    // ATTENTION : Si l'admin peut uploader pour n'importe quel client, cette ligne doit être modifiée
    // pour pointer vers le document du client CIBLE, pas de l'admin uploadant.
    // Pour l'instant, le code semble supposer que l'admin upload pour son propre compte client,
    // ce qui est probablement incorrect pour une app d'admin.
    // Si l'admin uploade pour le client dont l'UID est dans la collection 'clients', il faudrait le savoir ici.
    // Pour l'exemple actuel, je garde la logique existante qui lie à user.uid, mais sachez que c'est potentiellement un point à ajuster.
    const chantierRef = doc(db, 'clients', user.uid, 'chantier', chantierId);
    const storageRef = ref(storage, `chantier-photos/${chantierId}/${user.uid}-${Date.now()}-${file.name}`); // Ajout UID et timestamp pour unicité

    uploadStatus.textContent = 'Upload en cours...';
    uploadStatus.style.color = 'orange';
    uploadStatus.style.display = 'block';

    try {
        // Vérification que le document chantier existe AVANT de tenter l'upload
        const docSnapBeforeUpload = await firebaseGetDoc(chantierRef);
        if (!docSnapBeforeUpload.exists()) {
            console.error("Erreur : Le document chantier n'existe pas AVANT l'upload.", chantierRef.path);
            uploadStatus.textContent = 'Erreur : Le chantier spécifié n\'existe pas.';
            uploadStatus.style.color = 'red';
            return; // Arrête l'exécution si le chantier n'existe pas
        }

        // Lancer l'upload du fichier
        const uploadResult = await uploadBytes(storageRef, file);
        // Obtenir l'URL de téléchargement une fois l'upload terminé
        const downloadURL = await getDownloadURL(uploadResult.ref);

        // Mettre à jour le document chantier dans Firestore avec la nouvelle URL de photo
        await updateDoc(chantierRef, {
            photos: arrayUnion(downloadURL) // Ajoute l'URL à un tableau existant (ou crée le tableau)
        });

        // Indiquer le succès et réinitialiser le formulaire
        uploadStatus.textContent = 'Photo uploadée avec succès !';
        uploadStatus.style.color = 'green';
        uploadPhotoForm.reset(); // Réinitialise le formulaire après succès
        setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000); // Cache le statut après 3 secondes

    } catch (error) {
        console.error("Erreur lors de l'upload de la photo : ", error);
        // Afficher le message d'erreur à l'utilisateur
        uploadStatus.textContent = 'Erreur lors de l\'upload : ' + error.message;
        uploadStatus.style.color = 'red';
    }
});


// --- Fonctions de chargement des questions clients (reste identique) ---

function loadClientQuestions(uid) {
    // Cette fonction charge uniquement les questions posées par l'utilisateur connecté
    const questionsRef = collection(db, 'questions');
    const q = query(questionsRef, where('userId', '==', uid)); // Filtre par l'UID de l'utilisateur

    onSnapshot(q, (snapshot) => {
        questionsContainer.innerHTML = ''; // Vide le conteneur avant de le remplir
        if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const questionData = docSnap.data();
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('question-item');
                // Afficher la question et l'éventuelle réponse de l'admin
                questionDiv.innerHTML = `
                    <p><strong>Question :</strong> ${questionData.question}</p>
                    <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                    ${questionData.reponse ?
                        `<div class="reponse-admin">
                           <p><strong>Réponse :</strong> ${questionData.reponse}</p>
                           <p><em>Répondu le : ${questionData.timestampReponse ? new Date(questionData.timestampReponse.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>

                        </div>`
                        : '<p><em>En attente de réponse...</em></p>'
                    }
                    <hr>
                `;
                questionsContainer.appendChild(questionDiv);
            });
        } else {
            questionsContainer.innerHTML = '<p>Aucune question posée pour le moment.</p>';
        }
    }, (error) => {
        console.error("Erreur lors de la récupération des questions client : ", error);
        questionsContainer.innerHTML = '<p class="error">Erreur lors du chargement de vos questions.</p>';
    });
}


// --- Fonctions Admin (chargement de TOUTES les questions) ---

// Rendre la fonction async car elle va maintenant faire des requêtes Firestore pour chaque nom de client
function loadAdminQuestions() {
    // Cette fonction ne doit être appelée que si l'utilisateur est admin
    const questionsRef = collection(db, 'questions'); // Récupère toutes les questions (pas de filtre userId)

    onSnapshot(questionsRef, async (snapshot) => { // Le callback onSnapshot DOIT être async ici
        adminQuestionsContainer.innerHTML = ''; // Vide le conteneur avant de le remplir

        if (snapshot.empty) {
            adminQuestionsContainer.innerHTML = '<p>Aucune question en attente.</p>';
            return; // Sortir si pas de questions
        }

        // 1. Collecter les UID uniques des utilisateurs ayant posé des questions
        const uniqueUserIds = new Set();
        snapshot.forEach(docSnap => {
            const questionData = docSnap.data();
            if (questionData.userId) { // S'assurer que userId existe
                uniqueUserIds.add(questionData.userId);
            }
        });

        // 2. Récupérer les noms des clients correspondants depuis Firestore
        // On suppose ici que les profils clients (avec le nom) sont dans une collection 'clients' à la racine,
        // et que l'ID du document est l'UID de l'utilisateur.
        const userNameMap = new Map();
        const fetchPromises = Array.from(uniqueUserIds).map(async userId => {
            const clientDocRef = doc(db, 'clients', userId); // Référence au document client
            try {
                const clientDocSnap = await firebaseGetDoc(clientDocRef);
                // Stocker le nom si disponible, sinon un fallback
                if (clientDocSnap.exists() && clientDocSnap.data().nom) {
                    userNameMap.set(userId, clientDocSnap.data().nom);
                } else {
                    userNameMap.set(userId, `Client inconnu (${userId})`); // Nom de secours si doc ou nom manquant
                }
            } catch (error) {
                console.error("Erreur lors de la récupération du nom client pour UID:", userId, error);
                userNameMap.set(userId, `Erreur nom (${userId})`); // Nom de secours en cas d'erreur
            }
        });

        // Attendre que toutes les récupérations de noms soient terminées
        await Promise.all(fetchPromises);

        // 3. Afficher les questions en utilisant les noms récupérés
        snapshot.forEach((docSnap) => {
            const questionData = docSnap.data();
            const questionId = docSnap.id;
            const userId = questionData.userId;
            // Récupère le nom de la Map, avec un fallback si l'UID n'a pas été trouvé (ce qui ne devrait pas arriver si userId était dans le Set)
            const clientName = userNameMap.get(userId) || `UID: ${userId}`;

            const questionDiv = document.createElement('div');
            questionDiv.classList.add('admin-question-item');
            const replyFormId = `reply-form-${questionId}`;
            const replyStatusId = `reply-status-${questionId}`;

            questionDiv.innerHTML = `
                <p><strong>Client :</strong> ${clientName}</p>
                <p><strong>Question :</strong> ${questionData.question}</p>
                <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>

                ${questionData.reponse ? // Si une réponse existe déjà
                    `<div class="reponse-admin">
                       <p><strong>Réponse de l'admin :</strong> ${questionData.reponse}</p>
                       <p><em>Répondu le : ${questionData.timestampReponse ? new Date(questionData.timestampReponse.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                       <button class="edit-reply-button" data-question-id="${questionId}">Modifier</button>
                       <button class="delete-reply-button" data-question-id="${questionId}">Supprimer</button>
                    </div>`
                    : // Sinon, afficher le bouton "Répondre"
                    `<button class="reply-button" data-question-id="${questionId}">Répondre</button>`
                }

                <div id="${replyFormId}" style="display: none; margin-top: 10px;">
                    <textarea placeholder="Votre réponse" style="width: 95%; min-height: 60px;"></textarea>
                    <button class="submit-reply-button" data-question-id="${questionId}">Envoyer la réponse</button>
                    <p id="${replyStatusId}" style="display: none; margin-top: 5px;"></p>
                </div>
                <hr>
            `;
            adminQuestionsContainer.appendChild(questionDiv);
        });
    }, (error) => {
        console.error("Erreur lors de la récupération des questions pour l'admin : ", error);
        adminQuestionsContainer.innerHTML = '<p class="error">Erreur lors du chargement des questions.</p>';
    });
}


// --- Écouteur d'événements global pour la section admin (Répondre/Modifier/Supprimer) ---

adminQuestionsContainer.addEventListener('click', async (event) => {
    const target = event.target; // L'élément cliqué

    // --- Gérer le clic sur "Répondre" ---
    if (target.classList.contains('reply-button')) {
        const questionId = target.dataset.questionId;
        const replyForm = document.getElementById(`reply-form-${questionId}`);
        if (replyForm) {
             const textarea = replyForm.querySelector('textarea');
             const submitButton = replyForm.querySelector('.submit-reply-button');
             textarea.value = '';
             submitButton.textContent = 'Envoyer la réponse'; // Texte du bouton pour une nouvelle réponse
             replyForm.style.display = 'block'; // Affiche le formulaire de réponse
             target.style.display = 'none'; // Cache le bouton "Répondre"
        }
    }

    // --- Gérer le clic sur "Modifier" ---
    if (target.classList.contains('edit-reply-button')) {
        const questionId = target.dataset.questionId;
        const questionItem = target.closest('.admin-question-item'); // Trouve l'élément parent de la question
        const replyForm = questionItem.querySelector(`#reply-form-${questionId}`); // Trouve le formulaire dans cet élément parent
        if (replyForm) {
            // Récupère la réponse actuelle pour pré-remplir le textarea
            const reponseDiv = questionItem.querySelector('.reponse-admin p:first-child');
            const textarea = replyForm.querySelector('textarea');
            const submitButton = replyForm.querySelector('.submit-reply-button');
            const currentReply = reponseDiv ? reponseDiv.textContent.replace('Réponse de l\'admin :', '').trim() : '';
            textarea.value = currentReply;
            submitButton.textContent = 'Modifier la réponse'; // Texte du bouton pour la modification
            replyForm.style.display = 'block'; // Affiche le formulaire pour modification
        }
    }

    // --- Gérer le clic sur "Supprimer" ---
    if (target.classList.contains('delete-reply-button')) {
        const questionId = target.dataset.questionId;
        console.log("Tentative de suppression de la réponse pour la question ID :", questionId);

        // Confirmation utilisateur côté client (la sécurité côté serveur est assurée par les règles)
        if (confirm("Êtes-vous sûr de vouloir supprimer cette réponse ? Cette action est irréversible.")) {
            const questionRef = doc(db, 'questions', questionId);
            try {
                // Utilisation de deleteField() pour supprimer les champs liés à la réponse
                await updateDoc(questionRef, {
                    reponse: deleteField(),
                    reponduParAdmin: deleteField(), // Supprimer aussi ce champ si vous l'utilisez
                    timestampReponse: deleteField() // Supprimer le timestamp de réponse
                });
                console.log("Réponse supprimée avec succès pour la question ID :", questionId);
                // onSnapshot se chargera de rafraîchir l'affichage automatiquement
            } catch (error) {
                console.error("Erreur lors de la suppression de la réponse : ", error);
                alert("Une erreur est survenue lors de la suppression de la réponse."); // Informer l'admin
            }
        } else {
             console.log("Suppression annulée par l'utilisateur.");
        }
    }


    // --- Gérer le clic sur "Envoyer la réponse" / "Modifier la réponse" ---
    if (target.classList.contains('submit-reply-button')) {
        const questionId = target.dataset.questionId;
        const replyForm = target.closest('div[id^="reply-form-"]'); // Trouve le div formulaire parent
        if (!replyForm) return; // Sécurité (ne devrait pas arriver si le bouton est bien dans le div)

        const textarea = replyForm.querySelector('textarea');
        const replyText = textarea.value;
        const replyStatus = replyForm.querySelector(`p[id^="reply-status-"]`); // Élément pour afficher le statut
        const submitButton = target;
        const isModification = submitButton.textContent === 'Modifier la réponse'; // Détermine si c'est une modification ou une nouvelle réponse

        if (replyText.trim() !== '') {
            const questionRef = doc(db, 'questions', questionId);
            try {
                await updateDoc(questionRef, {
                    reponse: replyText,
                    reponduParAdmin: true, // Mark as replied by admin
                    timestampReponse: serverTimestamp() // Date of reply/modification
                });
                console.log(`Réponse ${isModification ? 'modifiée' : 'envoyée'} avec succès pour ID : ${questionId}`);

                // Cache the form and show a temporary status message
                textarea.value = ''; // Clear the textarea
                replyForm.style.display = 'none'; // Hide the form

                if(replyStatus) { // Show status if element exists
                    replyStatus.textContent = isModification ? 'Réponse modifiée.' : 'Réponse envoyée.';
                    replyStatus.style.color = 'green';
                    replyStatus.style.display = 'block';
                    setTimeout(() => { replyStatus.style.display = 'none'; }, 3000); // Hide after 3s
                }

            } catch (error) {
                console.error("Erreur lors de l'envoi/modification de la réponse : ", error);
                if(replyStatus) { // Show error if element exists
                    replyStatus.textContent = 'Erreur lors de l\'opération.';
                    replyStatus.style.color = 'red';
                    replyStatus.style.display = 'block';
                } else {
                    alert('Erreur lors de l\'opération.'); // Fallback if no status element
                }
            }
        } else {
            if(replyStatus) { // Show warning if reply is empty
                replyStatus.textContent = 'Veuillez saisir une réponse.';
                replyStatus.style.color = 'orange';
                replyStatus.style.display = 'block';
                setTimeout(() => { replyStatus.style.display = 'none'; }, 3000); // Hide after 3s
            } else {
                alert('Veuillez saisir une réponse.'); // Fallback if no status element
            }
        }
    }
});

// Optionnel : Vérification de l'état d'authentification au chargement initial
// Ceci permet de maintenir l'utilisateur connecté s'il a déjà un token valide
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Si un utilisateur est déjà connecté, afficher l'application et charger ses données
    loginContainer.style.display = 'none';
    appContainer.style.display = 'block';
    loadClientData(user.uid); // Appeler la fonction de chargement qui gère maintenant les rôles
  } else {
    // Si aucun utilisateur n'est connecté, afficher la page de connexion
    loginContainer.style.display = 'block';
    appContainer.style.display = 'none';
    // Vider les conteneurs si l'utilisateur était connecté et s'est déconnecté (ou si la page charge sans connexion)
    chantiersList.innerHTML = '';
    questionsContainer.innerHTML = '<p>Chargement des questions...</p>'; // Rétablir le message initial
    adminSection.style.display = 'none';
    adminQuestionsContainer.innerHTML = '';
  }
});