// Les importations sont gérées dans index.html, ce script utilise les variables globales
// comme window.firebaseAuthInstance, window.doc, etc.

// --- Variables globales pour les éléments du DOM ---
const questionsContainer = document.getElementById('questions-container');
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');

// Instances Firebase (initialisées dans index.html et assignées à window)
const auth = window.firebaseAuthInstance;
const db = window.firebaseDbInstance;
const storage = window.firebaseStorageInstance;
const { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp, updateDoc, arrayUnion, deleteField } = window;
// 'getDoc' de firestore est renommé en 'firebaseGetDoc' pour éviter un conflit de nom avec 'doc'
const { getDoc: firebaseGetDoc } = window;

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
console.log("SCRIPT LOAD CHECK: Element 'upload-photo-form' found?", uploadPhotoForm);

const clientUidInput = document.getElementById('client-uid');
const chantierIdInput = document.getElementById('chantier-id');
const photoFileInput = document.getElementById('photo-file');
const uploadStatus = document.getElementById('upload-status');

// --- Fonctions Login / Logout ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
        // La connexion déclenchera onAuthStateChanged qui s'occupera de tout charger
        await window.signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : ' + error.message;
        loginError.style.display = 'block';
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await window.signOut(auth);
        // onAuthStateChanged s'occupera de réinitialiser l'affichage
    } catch (error) {
        console.error("Erreur lors de la déconnexion : ", error);
    }
});


// --- 1. FONCTION loadClientData MODIFIÉE ---
// (Elle crée maintenant les éléments image un par un et leur attache un écouteur d'événement pour le zoom)
// (Elle utilise aussi 'isAdminByClaim' pour une meilleure cohérence avec la sécurité)
async function loadClientData(uid, isAdminByClaim) {

  // --- Chargement des chantiers spécifiques au client connecté ---
  const chantiersRef = collection(db, 'clients', uid, 'chantier');
  onSnapshot(chantiersRef, (snapshot) => {
    chantiersList.innerHTML = ''; // Toujours vider la liste avant de la repeupler
    snapshot.forEach((docSnap) => {
      const chantierData = docSnap.data();
      
      const chantierDiv = document.createElement('div');
      chantierDiv.classList.add('chantier-item');
      
      // Construire le contenu de base du chantier
      chantierDiv.innerHTML = `
        <h3>Chantier à : ${chantierData.adresse || 'Adresse non spécifiée'}</h3>
        <p>Jours d'intervention : ${chantierData.joursIntervention ? chantierData.joursIntervention.join(', ') : 'Non définis'}</p>
        <p>Avancement : ${chantierData.pourcentageAvancement || 0}%</p>
        <h4>Photos :</h4>
      `;
      
      const photosContainer = document.createElement('div');
      photosContainer.classList.add('photos-container');
      
      // Traiter et ajouter les photos
      if (chantierData.photos && chantierData.photos.length > 0) {
        chantierData.photos.forEach(photoUrl => {
            const imgElement = document.createElement('img');
            imgElement.src = photoUrl;
            imgElement.alt = "Photo du chantier";
            imgElement.width = 100; // Définit la taille de la miniature
            
            // Étape clé : Ajouter l'écouteur d'événement pour la lightbox
            imgElement.addEventListener('click', () => {
                const lightbox = document.getElementById('image-lightbox');
                const lightboxImg = document.getElementById('lightbox-image');
                if(lightbox && lightboxImg) {
                    lightbox.style.display = "block";
                    lightboxImg.src = photoUrl;
                }
            });
            
            photosContainer.appendChild(imgElement);
        });
      } else {
        photosContainer.textContent = 'Aucune photo pour le moment.';
      }

      chantierDiv.appendChild(photosContainer);
      chantiersList.appendChild(chantierDiv);
    });
  }, (error) => {
    console.error("Erreur lors de la récupération des chantiers : ", error);
    chantiersList.innerHTML = `<p class="error">Erreur lors du chargement de vos chantiers : ${error.message}</p>`;
  });

  // Charge les questions posées par l'utilisateur connecté
  loadClientQuestions(uid);

  // --- Logique pour afficher/cacher les sections admin/upload en fonction du rôle ---
  const uploadPhotoContainer = document.getElementById('upload-photo-container'); 

  if (isAdminByClaim) {
    adminSection.style.display = 'block';
    uploadPhotoContainer.style.display = 'block';
    loadAdminQuestions();
  } else {
    adminSection.style.display = 'none';
    uploadPhotoContainer.style.display = 'none';
    if(adminQuestionsContainer) adminQuestionsContainer.innerHTML = '';
  }
}

// --- Fonction d'envoi de question (inchangée) ---
questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionText.value;
    const user = auth.currentUser;
    if (user && question.trim()) {
        try {
            // Note: `doc(collection(...))` crée un document avec un ID auto-généré. `addDoc` est plus direct.
            await window.addDoc(collection(db, 'questions'), {
                userId: user.uid,
                question: question,
                timestamp: serverTimestamp()
            });
            questionText.value = '';
            questionConfirmation.textContent = 'Votre question a été envoyée.';
            questionConfirmation.style.color = 'green';
            questionConfirmation.style.display = 'block';
            setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
        } catch (error) {
            console.error("Erreur lors de l'envoi de la question : ", error);
            questionConfirmation.textContent = "Erreur lors de l'envoi de la question.";
            questionConfirmation.style.color = 'red';
            questionConfirmation.style.display = 'block';
        }
    }
});

// --- Fonction d'upload de photo pour Admin (inchangée) ---
if (uploadPhotoForm) {
    uploadPhotoForm.addEventListener('submit', async (e) => {
        console.log("UPLOAD EVENT CHECK: Submit event listener triggered for upload form.");
        e.preventDefault();

        const clientUid = clientUidInput.value.trim();
        const chantierId = chantierIdInput.value.trim();
        const file = photoFileInput.files[0];
        const user = auth.currentUser;

        if (!user) {
            uploadStatus.textContent = 'Vous devez être connecté pour uploader des photos.';
            uploadStatus.style.display = 'block';
            return;
        }
        if (!file) {
            uploadStatus.textContent = 'Veuillez sélectionner un fichier photo.';
            uploadStatus.style.display = 'block';
            return;
        }
        if (!clientUid || !chantierId) {
            uploadStatus.textContent = 'Erreur : L\'UID du client et l\'ID du chantier sont nécessaires.';
            uploadStatus.style.display = 'block';
            return;
        }

        const chantierRef = doc(db, 'clients', clientUid, 'chantier', chantierId);
        uploadStatus.textContent = 'Vérification du chantier...';
        uploadStatus.style.display = 'block';

        try {
            const docSnapBeforeUpload = await firebaseGetDoc(chantierRef);

            if (!docSnapBeforeUpload.exists()) {
                uploadStatus.textContent = 'Erreur : Le chantier spécifié n\'existe pas ou l\'UID client est incorrect.';
                uploadStatus.style.color = 'red';
                return;
            }

            const storageRef = window.ref(storage, `chantier-photos/${chantierId}/${clientUid}-${Date.now()}-${file.name}`);
            uploadStatus.textContent = 'Upload de la photo en cours...';

            const uploadResult = await window.uploadBytes(storageRef, file);
            const downloadURL = await window.getDownloadURL(uploadResult.ref);

            await updateDoc(chantierRef, { photos: arrayUnion(downloadURL) });

            uploadStatus.textContent = 'Photo uploadée avec succès !';
            uploadStatus.style.color = 'green';
            uploadPhotoForm.reset();
            setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);
        } catch (error) {
            console.error("Erreur lors de l'upload de la photo : ", error);
            uploadStatus.textContent = 'Erreur lors de l\'opération : ' + error.message;
            uploadStatus.style.color = 'red';
        }
    });
} else {
    console.error("SCRIPT LOAD CHECK: Element with ID 'upload-photo-form' was NOT found!");
}

// --- Fonctions de chargement des questions clients (inchangée) ---
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
        questionsContainer.innerHTML = `<p class="error">Erreur lors du chargement de vos questions: ${error.message}</p>`;
    });
}

// --- Fonctions Admin (chargement de TOUTES les questions) (inchangée) ---
function loadAdminQuestions() {
    const questionsRef = collection(db, 'questions');
    onSnapshot(questionsRef, async (snapshot) => {
        adminQuestionsContainer.innerHTML = '';
        if (snapshot.empty) {
            adminQuestionsContainer.innerHTML = '<p>Aucune question en attente.</p>';
            return;
        }

        const userIds = [...new Set(snapshot.docs.map(d => d.data().userId).filter(Boolean))];
        const userPromises = userIds.map(id => firebaseGetDoc(doc(db, 'clients', id)));
        const userDocs = await Promise.all(userPromises);
        const userNameMap = new Map(userDocs.map(d => [d.id, d.exists() ? d.data().nom : `Client inconnu (${d.id})`]));

        snapshot.forEach((docSnap) => {
            const questionData = docSnap.data();
            const questionId = docSnap.id;
            const userId = questionData.userId;
            const clientName = userNameMap.get(userId) || `UID: ${userId}`;

            const questionDiv = document.createElement('div');
            questionDiv.classList.add('admin-question-item');
            const replyFormId = `reply-form-${questionId}`;

            questionDiv.innerHTML = `
                <p><strong>Client :</strong> ${clientName} (<code>${userId}</code>)</p>
                <p><strong>Question :</strong> ${questionData.question}</p>
                <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                ${questionData.reponse ? 
                    `<div class="reponse-admin">
                        <p><strong>Réponse de l'admin :</strong> ${questionData.reponse}</p>
                        <button class="edit-reply-button" data-question-id="${questionId}">Modifier</button>
                        <button class="delete-reply-button" data-question-id="${questionId}">Supprimer</button>
                    </div>`
                    : `<button class="reply-button" data-question-id="${questionId}">Répondre</button>`
                }
                <div id="${replyFormId}" style="display: none; margin-top: 10px;">
                    <textarea placeholder="Votre réponse"></textarea>
                    <button class="submit-reply-button" data-question-id="${questionId}">Envoyer</button>
                </div>
                <hr>
            `;
            adminQuestionsContainer.appendChild(questionDiv);
        });
    }, (error) => {
        console.error("Erreur lors de la récupération des questions admin : ", error);
        adminQuestionsContainer.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
    });
}

// --- Écouteur d'événements global pour la section admin (inchangé) ---
adminQuestionsContainer.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.classList.contains('reply-button') || target.classList.contains('edit-reply-button')) {
        const questionId = target.dataset.questionId;
        const form = document.getElementById(`reply-form-${questionId}`);
        if(form) form.style.display = 'block';
    }

    if (target.classList.contains('delete-reply-button')) {
        const questionId = target.dataset.questionId;
        if (confirm("Êtes-vous sûr de vouloir supprimer cette réponse ?")) {
            const questionRef = doc(db, 'questions', questionId);
            try {
                await updateDoc(questionRef, {
                    reponse: deleteField(),
                    timestampReponse: deleteField()
                });
            } catch (error) {
                console.error("Erreur lors de la suppression de la réponse : ", error);
                alert("Erreur lors de la suppression.");
            }
        }
    }

    if (target.classList.contains('submit-reply-button')) {
        const questionId = target.dataset.questionId;
        const form = target.closest('div[id^="reply-form-"]');
        const textarea = form.querySelector('textarea');
        if (textarea.value.trim()) {
            const questionRef = doc(db, 'questions', questionId);
            try {
                await updateDoc(questionRef, {
                    reponse: textarea.value,
                    timestampReponse: serverTimestamp()
                });
                form.style.display = 'none';
            } catch (error) {
                console.error("Erreur lors de l'envoi de la réponse : ", error);
                alert("Erreur lors de l'envoi.");
            }
        }
    }
});

// --- 2. GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION MODIFIÉ ---
// (Il vérifie maintenant les claims pour déterminer le rôle)
window.onAuthStateChanged(auth, async (user) => {
  if (user) {
    let isAdminByClaim = false;
    try {
        const idTokenResult = await user.getIdTokenResult(true); // true force le rafraîchissement
        console.log("Vérification des claims du jeton :", idTokenResult.claims);
        if (idTokenResult.claims.admin === true) {
            isAdminByClaim = true;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des claims du jeton :", error);
    }
    
    loginContainer.style.display = 'none';
    appContainer.style.display = 'block';
    loadClientData(user.uid, isAdminByClaim); // Passer le statut admin basé sur les claims

  } else {
    loginContainer.style.display = 'block';
    appContainer.style.display = 'none';
    chantiersList.innerHTML = '';
    questionsContainer.innerHTML = '<p>Chargement des questions...</p>';
    adminSection.style.display = 'none';
    adminQuestionsContainer.innerHTML = '';
  }
});


// --- 3. AJOUT DU CODE POUR LA LIGHTBOX ---
// Logique pour la Lightbox (s'assure que le DOM est prêt)
document.addEventListener('DOMContentLoaded', () => {
  const lightbox = document.getElementById('image-lightbox');
  const closeBtn = document.querySelector('.lightbox-close');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      lightbox.style.display = "none";
    });
  }

  if (lightbox) {
      lightbox.addEventListener('click', (event) => {
          if(event.target === lightbox) {
              lightbox.style.display = "none";
          }
      });
  }
});
