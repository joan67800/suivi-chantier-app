// Les instances et fonctions Firebase sont exposées via l'objet `window` depuis index.html

const questionsContainer = document.getElementById('questions-container');
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');
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
const clientUidInput = document.getElementById('client-uid');
const chantierIdInput = document.getElementById('chantier-id');
const photoFileInput = document.getElementById('photo-file');
const uploadStatus = document.getElementById('upload-status');

const auth = window.firebaseAuthInstance;
const db = window.firebaseDbInstance;
const storage = window.firebaseStorageInstance;

// --- Fonctions Login / Logout ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
        await window.signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : Identifiants incorrects.';
        console.error("Login error:", error.message);
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await window.signOut(auth);
    } catch (error) {
        console.error("Erreur lors de la déconnexion : ", error);
    }
});

// --- Fonctions principales de l'application ---

async function loadClientData(uid, isAdminByClaim) {
    const chantiersRef = window.collection(db, 'clients', uid, 'chantier');
    window.onSnapshot(chantiersRef, (snapshot) => {
        chantiersList.innerHTML = '';
        snapshot.forEach((doc) => {
            const chantierData = doc.data();
            const chantierDiv = document.createElement('div');
            chantierDiv.classList.add('chantier-item');

            chantierDiv.innerHTML = `
                <h3>Chantier à : ${chantierData.adresse || 'Adresse non spécifiée'}</h3>
                <p>Avancement : ${chantierData.pourcentageAvancement || 0}%</p>
                <h4>Photos :</h4>
            `;

            const photosContainer = document.createElement('div');
            photosContainer.classList.add('photos-container');

            if (chantierData.photos && chantierData.photos.length > 0) {
                chantierData.photos.forEach(photoUrl => {
                    const imgElement = document.createElement('img');
                    imgElement.src = photoUrl;
                    imgElement.alt = "Photo du chantier";
                    imgElement.width = 150;

                    imgElement.addEventListener('click', () => {
                        const lightbox = document.getElementById('image-lightbox');
                        const lightboxImg = document.getElementById('lightbox-image');
                        if (lightbox && lightboxImg) {
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
        chantiersList.innerHTML = `<p class="error">Erreur de chargement des chantiers : ${error.message}</p>`;
    });

    loadClientQuestions(uid);

    const uploadPhotoContainer = document.getElementById('upload-photo-container');
    if (isAdminByClaim) {
        adminSection.style.display = 'block';
    } else {
        adminSection.style.display = 'none';
    }
}

function loadClientQuestions(uid) {
    const questionsRef = window.collection(db, 'questions');
    const q = window.query(questionsRef, window.where('userId', '==', uid));
    window.onSnapshot(q, (snapshot) => {
        questionsContainer.innerHTML = '';
        if (!snapshot.empty) {
            snapshot.forEach((doc) => {
                const questionData = doc.data();
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('question-item');
                questionDiv.innerHTML = `
                    <p><strong>Question :</strong> ${questionData.question}</p>
                    <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                    ${questionData.reponse ?
                        `<div class="reponse-admin"><p><strong>Réponse :</strong> ${questionData.reponse}</p></div>` :
                        '<p><em>En attente de réponse...</em></p>'
                    }
                `;
                questionsContainer.appendChild(questionDiv);
            });
        } else {
            questionsContainer.innerHTML = '<p>Aucune question posée pour le moment.</p>';
        }
    }, (error) => {
        console.error("Erreur de récupération des questions client:", error);
        questionsContainer.innerHTML = `<p class="error">Erreur de chargement des questions: ${error.message}</p>`;
    });
}

function loadAdminQuestions() {
    const questionsRef = window.collection(db, 'questions');
    window.onSnapshot(questionsRef, async (snapshot) => {
        adminQuestionsContainer.innerHTML = '';
        if (snapshot.empty) {
            adminQuestionsContainer.innerHTML = '<p>Aucune question en attente.</p>';
            return;
        }

        const userIds = [...new Set(snapshot.docs.map(d => d.data().userId).filter(Boolean))];
        const userPromises = userIds.map(id => window.firebaseGetDoc(window.doc(db, 'clients', id)));
        const userDocs = await Promise.all(userPromises);
        const userNameMap = new Map(userDocs.map(d => [d.id, d.exists() ? d.data().nom : `Client inconnu`]));
        
        snapshot.docs.sort((a,b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0)).forEach((docSnap) => {
             const questionData = docSnap.data();
             // ... le reste de la logique d'affichage admin que vous aviez déjà
        });

    }, (error) => {
        console.error("Erreur de récupération des questions admin:", error);
    });
}


// --- Écouteurs d'événements pour les formulaires ---

if (questionForm) {
    questionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = questionText.value;
        const user = auth.currentUser;
        if (user && question.trim()) {
            try {
                await window.addDoc(window.collection(db, 'questions'), {
                    userId: user.uid,
                    question: question,
                    timestamp: window.serverTimestamp()
                });
                questionText.value = '';
                questionConfirmation.textContent = 'Votre question a été envoyée.';
                questionConfirmation.style.display = 'block';
                setTimeout(() => { questionConfirmation.style.display = 'none'; }, 3000);
            } catch (error) {
                console.error("Erreur d'envoi de la question:", error);
            }
        }
    });
}

if (uploadPhotoForm) {
    uploadPhotoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // ... votre logique d'upload de photo existante ...
    });
}


// --- GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION (POINT D'ENTRÉE) ---
window.onAuthStateChanged(auth, async (user) => {
    if (user) {
        let isAdminByClaim = false;
        try {
            const idTokenResult = await user.getIdTokenResult(true);
            console.log("Vérification des claims du jeton :", idTokenResult.claims);
            if (idTokenResult.claims.admin === true) {
                isAdminByClaim = true;
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des claims du jeton :", error);
        }

        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        loadClientData(user.uid, isAdminByClaim);
    } else {
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
        chantiersList.innerHTML = '';
        questionsContainer.innerHTML = '';
        adminSection.style.display = 'none';
        adminQuestionsContainer.innerHTML = '';
    }
});


// --- GESTION DE LA LIGHTBOX ---
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
          if (event.target === lightbox) {
              lightbox.style.display = "none";
          }
      });
  }
});