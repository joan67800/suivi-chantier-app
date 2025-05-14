// Importez deleteField en plus des autres fonctions Firestore
import { getFirestore, collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, updateDoc, arrayUnion, deleteField, getDoc as firebaseGetDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const ADMIN_UIDS = ['Gz2BmJ9EuvbSceZZ1jwap8HUgd82']; // Remplacez par votre UID administrateur
const questionsContainer = document.getElementById('questions-container');
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');

// Instances Firebase (supposées initialisées ailleurs)
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

// --- Fonctions Login / Logout / Chargement Données Client / Envoi Question / Upload Photo ---
// (Ces fonctions restent identiques à la version précédente)

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        loadClientData(userCredential.user.uid);
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : ' + error.message;
        loginError.style.display = 'block';
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
        chantiersList.innerHTML = '';
        questionsContainer.innerHTML = '<p>Chargement des questions...</p>';
        adminSection.style.display = 'none';
        adminQuestionsContainer.innerHTML = ''; // Vider aussi les questions admin
    } catch (error) {
        console.error("Erreur lors de la déconnexion : ", error);
    }
});

function loadClientData(uid) {
    const chantiersRef = collection(db, 'clients', uid, 'chantier');
    onSnapshot(chantiersRef, (snapshot) => {
        chantiersList.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const chantierData = docSnap.data();
            const chantierDiv = document.createElement('div');
            chantierDiv.classList.add('chantier-item');
            chantierDiv.innerHTML = `
                <h3>Chantier à : ${chantierData.adresse}</h3>
                <p>Jours d'intervention : ${chantierData.joursIntervention ? chantierData.joursIntervention.join(', ') : 'Non définis'}</p>
                <p>Avancement : ${chantierData.pourcentageAvancement}%</p>
                <h4>Photos :</h4>
                <div class="photos-container">
                    ${chantierData.photos ? chantierData.photos.map(url => `<img src="${url}" alt="Photo du chantier" width="100">`).join('') : 'Aucune photo pour le moment.'}
                </div>
            `;
            chantiersList.appendChild(chantierDiv);
        });
    }, (error) => {
        console.error("Erreur lors de la récupération des chantiers : ", error);
    });

    loadClientQuestions(uid);

    const uploadPhotoContainer = document.getElementById('upload-photo-container'); // Assurez-vous que cette variable est définie ou récupérez l'élément ici

if (ADMIN_UIDS.includes(uid)) {
    // Si l'utilisateur est admin
    adminSection.style.display = 'block'; // Affiche la section admin
    uploadPhotoContainer.style.display = 'block'; // Affiche la section d'upload de photos
    loadAdminQuestions(); // Charge les questions admin
} else {
    // Si l'utilisateur est un client standard
    adminSection.style.display = 'none'; // Cache la section admin
    uploadPhotoContainer.style.display = 'none'; // Cache la section d'upload de photos
}
}

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
            questionConfirmation.style.display = 'block';
            setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
        } catch (error) {
            console.error("Erreur lors de l'envoi de la question : ", error);
            alert("Erreur lors de l'envoi de la question."); // Informer l'utilisateur
        }
    } else if (!question.trim()) {
         alert("Veuillez saisir une question.");
    } else {
        console.log("Utilisateur non connecté, impossible d'envoyer la question.");
        alert("Vous devez être connecté pour poser une question.");
    }
});


uploadPhotoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chantierId = chantierIdInput.value;
    const file = photoFileInput.files[0];
    const user = auth.currentUser;

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

    const storageRef = ref(storage, `chantier-photos/${chantierId}/${user.uid}-${Date.now()}-${file.name}`); // Ajout UID et timestamp pour unicité
    const chantierRef = doc(db, 'clients', user.uid, 'chantier', chantierId);

    uploadStatus.textContent = 'Upload en cours...';
    uploadStatus.style.color = 'orange';
    uploadStatus.style.display = 'block';

    try {
        const docSnapBeforeUpload = await firebaseGetDoc(chantierRef);
        if (!docSnapBeforeUpload.exists()) {
            console.error("Erreur : Le document chantier n'existe pas AVANT l'upload.", chantierRef.path);
            uploadStatus.textContent = 'Erreur : Le chantier spécifié n\'existe pas.';
            uploadStatus.style.color = 'red';
            return; // Stop execution
        }

        const uploadResult = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);

        await updateDoc(chantierRef, {
            photos: arrayUnion(downloadURL)
        });

        uploadStatus.textContent = 'Photo uploadée avec succès !';
        uploadStatus.style.color = 'green';
        uploadPhotoForm.reset(); // Reset form on success
        setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);

    } catch (error) {
        console.error("Erreur lors de l'upload de la photo : ", error);
        uploadStatus.textContent = 'Erreur lors de l\'upload : ' + error.message;
        uploadStatus.style.color = 'red';
    }
});


function loadClientQuestions(uid) {
    const questionsRef = collection(db, 'questions');
    const q = query(questionsRef, where('userId', '==', uid));

    onSnapshot(q, (snapshot) => {
        questionsContainer.innerHTML = '';
        if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const questionData = docSnap.data();
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('question-item');
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


// --- Fonctions Admin ---

function loadAdminQuestions() {
    const questionsRef = collection(db, 'questions'); // Récupère toutes les questions

    onSnapshot(questionsRef, (snapshot) => {
        adminQuestionsContainer.innerHTML = ''; // Vide le conteneur avant de le remplir
        if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
                const questionData = docSnap.data();
                const questionId = docSnap.id; // ID du document question
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('admin-question-item');
                const replyFormId = `reply-form-${questionId}`;
                const replyStatusId = `reply-status-${questionId}`;

                questionDiv.innerHTML = `
                  <p><strong>ID Utilisateur :</strong> ${questionData.userId}</p>
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
        } else {
            adminQuestionsContainer.innerHTML = '<p>Aucune question en attente.</p>';
        }
    }, (error) => {
        console.error("Erreur lors de la récupération des questions pour l'admin : ", error);
        adminQuestionsContainer.innerHTML = '<p class="error">Erreur lors du chargement des questions.</p>';
    });
}


// --- Écouteur d'événements global pour la section admin ---
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
             submitButton.textContent = 'Envoyer la réponse';
             replyForm.style.display = 'block'; // Affiche le formulaire
             target.style.display = 'none'; // Cache le bouton "Répondre"
        }
    }

    // --- Gérer le clic sur "Modifier" ---
    if (target.classList.contains('edit-reply-button')) {
        const questionId = target.dataset.questionId;
        const questionItem = target.closest('.admin-question-item');
        const replyForm = questionItem.querySelector(`#reply-form-${questionId}`);
        if (replyForm) {
            const reponseDiv = questionItem.querySelector('.reponse-admin p:first-child');
            const textarea = replyForm.querySelector('textarea');
            const submitButton = replyForm.querySelector('.submit-reply-button');
            const currentReply = reponseDiv ? reponseDiv.textContent.replace('Réponse de l\'admin :', '').trim() : '';
            textarea.value = currentReply;
            submitButton.textContent = 'Modifier la réponse';
            replyForm.style.display = 'block'; // Affiche le formulaire pour modification
        }
    }

     // --- Gérer le clic sur "Supprimer" ---  AJOUT DE CETTE SECTION
    if (target.classList.contains('delete-reply-button')) {
        const questionId = target.dataset.questionId;
        console.log("Tentative de suppression de la réponse pour la question ID :", questionId);

        // Confirmation utilisateur
        if (confirm("Êtes-vous sûr de vouloir supprimer cette réponse ? Cette action est irréversible.")) {
            const questionRef = doc(db, 'questions', questionId);
            try {
                // Utilisation de deleteField() pour supprimer les champs liés à la réponse
                await updateDoc(questionRef, {
                    reponse: deleteField(),
                    reponduParAdmin: deleteField(),
                    timestampReponse: deleteField()
                });
                console.log("Réponse supprimée avec succès pour la question ID :", questionId);
                // Pas besoin de manipuler l'UI ici, onSnapshot va la rafraîchir.
                // On pourrait afficher un message temporaire si besoin.
                // Exemple : alert("Réponse supprimée.");
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
        if (!replyForm) return; // Sécurité

        const textarea = replyForm.querySelector('textarea');
        const replyText = textarea.value;
        const replyStatus = replyForm.querySelector(`p[id^="reply-status-"]`);
        const submitButton = target;
        const isModification = submitButton.textContent === 'Modifier la réponse';

        if (replyText.trim() !== '') {
            const questionRef = doc(db, 'questions', questionId);
            try {
                await updateDoc(questionRef, {
                    reponse: replyText,
                    reponduParAdmin: true,
                    timestampReponse: serverTimestamp()
                });
                console.log(`Réponse ${isModification ? 'modifiée' : 'envoyée'} avec succès pour ID : ${questionId}`);

                // Cache le formulaire et affiche statut (onSnapshot mettra à jour le reste)
                textarea.value = '';
                replyForm.style.display = 'none';
                if(replyStatus) {
                    replyStatus.textContent = isModification ? 'Réponse modifiée.' : 'Réponse envoyée.';
                    replyStatus.style.color = 'green';
                    replyStatus.style.display = 'block';
                    setTimeout(() => { replyStatus.style.display = 'none'; }, 3000);
                }

            } catch (error) {
                console.error("Erreur lors de l'envoi/modification de la réponse : ", error);
                 if(replyStatus) {
                    replyStatus.textContent = 'Erreur lors de l\'opération.';
                    replyStatus.style.color = 'red';
                    replyStatus.style.display = 'block';
                 } else {
                    alert('Erreur lors de l\'opération.');
                 }
            }
        } else {
            if(replyStatus) {
                replyStatus.textContent = 'Veuillez saisir une réponse.';
                replyStatus.style.color = 'orange';
                replyStatus.style.display = 'block';
                setTimeout(() => { replyStatus.style.display = 'none'; }, 3000);
            } else {
                alert('Veuillez saisir une réponse.');
            }
        }
    }
});

// Optionnel : Vérification de l'état d'authentification au chargement initial
/*
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = 'none';
    appContainer.style.display = 'block';
    loadClientData(user.uid);
  } else {
    loginContainer.style.display = 'block';
    appContainer.style.display = 'none';
  }
});
*/