// On importe les fonctions directement ici pour plus de clarté et de stabilité
import { getFirestore, collection, query, where, onSnapshot, getDocs, doc, addDoc, updateDoc, deleteField, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getDoc as firebaseGetDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// Éléments du DOM
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app-container');
const appTitle = document.getElementById('app-title');
const logoutButton = document.getElementById('logout-button');
const chantiersList = document.getElementById('chantiers-list');

// Section Questions Client
const clientQuestionSection = document.getElementById('client-question-section');
const questionsContainer = document.getElementById('questions-container');
const questionForm = document.getElementById('question-form');
const questionText = document.getElementById('question-text');
const questionConfirmation = document.getElementById('question-confirmation');

// Section Admin
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');
const uploadPhotoForm = document.getElementById('upload-photo-form');
const clientUidInput = document.getElementById('client-uid');
const chantierIdInput = document.getElementById('chantier-id');
const photoFileInput = document.getElementById('photo-file');
const uploadStatus = document.getElementById('upload-status');
const adminQuestionForm = document.getElementById('admin-question-form');
const targetClientUidInput = document.getElementById('target-client-uid');
const adminQuestionText = document.getElementById('admin-question-text');
const adminQuestionConfirmation = document.getElementById('admin-question-confirmation');

// Instances Firebase (elles sont initialisées dans index.html)
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
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : Identifiants incorrects.';
        console.error("Login error:", error.message);
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erreur lors de la déconnexion : ", error);
    }
});


// --- Fonctions principales de l'application ---

function showClientView(user) {
    appTitle.textContent = "Suivi de vos chantiers";
    adminSection.style.display = 'none';
    clientQuestionSection.style.display = 'block';
    loadClientChantiers(user.uid);
    loadClientQuestions(user.uid);
}

function showAdminView(user) {
    appTitle.textContent = "Espace Administration";
    adminSection.style.display = 'block';
    clientQuestionSection.style.display = 'none';
    chantiersList.innerHTML = ''; // L'admin n'a pas de vue "chantier" par défaut
    loadAdminQuestions();
}

function loadClientChantiers(uid) {
    const chantiersRef = collection(db, 'clients', uid, 'chantier');
    onSnapshot(chantiersRef, (snapshot) => {
        chantiersList.innerHTML = '';
        if (snapshot.empty) {
            chantiersList.innerHTML = '<p>Aucun chantier ne vous est actuellement attribué.</p>';
            return;
        }
        snapshot.forEach((docSnap) => {
            const chantierData = docSnap.data();
            const chantierDiv = document.createElement('div');
            chantierDiv.classList.add('chantier-item');
            chantierDiv.innerHTML = `
                <h3>Chantier à : ${chantierData.adresse || 'Adresse non spécifiée'}</h3>
                <p><strong>Jours d'intervention :</strong> ${chantierData.joursIntervention ? chantierData.joursIntervention.join(', ') : 'Non définis'}</p>
                <p><strong>Avancement :</strong> ${chantierData.pourcentageAvancement || 0}%</p>
                <h4>Photos :</h4>
            `;
            const photosContainer = document.createElement('div');
            photosContainer.classList.add('photos-container');
            if (chantierData.photos && chantierData.photos.length > 0) {
                chantierData.photos.forEach(photoUrl => {
                    const imgElement = document.createElement('img');
                    imgElement.src = photoUrl;
                    imgElement.alt = "Photo du chantier";
                    imgElement.addEventListener('click', () => openLightbox(photoUrl));
                    photosContainer.appendChild(imgElement);
                });
            } else {
                photosContainer.textContent = 'Aucune photo pour le moment.';
            }
            chantierDiv.appendChild(photosContainer);
            chantiersList.appendChild(chantierDiv);
        });
    }, (error) => {
        console.error("Erreur lors de la récupération des chantiers :", error);
        chantiersList.innerHTML = `<p class="error">Erreur de chargement des chantiers.</p>`;
    });
}

// CORRECTION : Utilisation de getDocs pour un chargement unique et plus fiable
async function loadClientQuestions(uid) {
    questionsContainer.innerHTML = '<p>Chargement de vos questions...</p>';
    try {
        const qByClient = query(collection(db, 'questions'), where('userId', '==', uid));
        const qToClient = query(collection(db, 'questions'), where('askedTo', '==', uid));

        const [byClientSnapshot, toClientSnapshot] = await Promise.all([
            getDocs(qByClient),
            getDocs(qToClient)
        ]);

        const questionsFromClient = byClientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const questionsToClient = toClientSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const allQuestions = [...questionsFromClient, ...questionsToClient];
        renderClientQuestions(allQuestions);
    } catch (error) {
        console.error("Erreur de récupération des questions client:", error);
        questionsContainer.innerHTML = `<p class="error">Erreur de chargement des questions.</p>`;
    }
}


function renderClientQuestions(questions) {
    questionsContainer.innerHTML = '';
    if (questions.length === 0) {
        questionsContainer.innerHTML = '<p>Aucune question pour le moment.</p>';
        return;
    }
    questions
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
        .forEach(questionData => {
            const questionDiv = document.createElement('div');
            questionDiv.classList.add('question-item');
            if (questionData.askedBy) {
                questionDiv.classList.add('question-from-admin');
            }
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
}

// CORRECTION : Utilisation de getDocs pour un chargement unique et plus fiable
async function loadAdminQuestions() {
    adminQuestionsContainer.innerHTML = '<p>Chargement des questions des clients...</p>';
    try {
        const questionsRef = collection(db, 'questions');
        const q = query(questionsRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        const clientQuestions = snapshot.docs.filter(doc => doc.data().userId);

        if (clientQuestions.length === 0) {
            adminQuestionsContainer.innerHTML = '<h3>Questions des clients</h3><p>Aucune question de client en attente.</p>';
            return;
        } else {
            adminQuestionsContainer.innerHTML = '<h3>Questions des clients</h3>';
        }

        const userIds = [...new Set(clientQuestions.map(d => d.data().userId))];
        const userPromises = userIds.map(id => firebaseGetDoc(doc(db, 'clients', id)));
        const userDocs = await Promise.all(userPromises);
        const userNameMap = new Map(userDocs.map(d => [d.id, d.exists() ? d.data().nom : `Client inconnu`]));

        clientQuestions.forEach((docSnap) => {
            const questionData = docSnap.data();
            const questionId = docSnap.id;
            const userId = questionData.userId;
            const clientName = userNameMap.get(userId) || `UID: ${userId}`;

            const questionDiv = document.createElement('div');
            questionDiv.classList.add('admin-question-item');
            questionDiv.innerHTML = `
                <p><strong>Client :</strong> ${clientName} (<code>${userId}</code>)</p>
                <p><strong>Question :</strong> ${questionData.question}</p>
                <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                ${questionData.reponse ? `
                    <div class="reponse-admin">
                        <p><strong>Votre Réponse :</strong> ${questionData.reponse}</p>
                        <button class="edit-reply-button" data-question-id="${questionId}">Modifier</button>
                    </div>` :
                    `<button class="reply-button" data-question-id="${questionId}">Répondre</button>`
                }
                <div id="reply-form-${questionId}" style="display: none; margin-top: 10px;">
                    <textarea>${questionData.reponse || ''}</textarea>
                    <button class="submit-reply-button" data-question-id="${questionId}">Envoyer la réponse</button>
                </div>`;
            adminQuestionsContainer.appendChild(questionDiv);
        });
    } catch (error) {
        console.error("Erreur de récupération des questions admin:", error);
        adminQuestionsContainer.innerHTML = `<p class="error">Erreur de chargement des questions.</p>`;
    }
}


// --- Écouteurs d'événements pour les formulaires ---

questionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionText.value.trim();
    if (question && auth.currentUser) {
        try {
            await addDoc(collection(db, 'questions'), {
                userId: auth.currentUser.uid,
                question: question,
                timestamp: serverTimestamp()
            });
            questionText.value = '';
            showConfirmation(questionConfirmation, 'Votre question a été envoyée.', 'success');
        } catch (error) { console.error("Erreur d'envoi de la question:", error); }
    }
});

adminQuestionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = adminQuestionText.value.trim();
    const targetUid = targetClientUidInput.value.trim();
    if (question && targetUid && auth.currentUser) {
        try {
            await addDoc(collection(db, 'questions'), {
                askedBy: auth.currentUser.uid,
                askedTo: targetUid,
                question: question,
                timestamp: serverTimestamp()
            });
            adminQuestionText.value = '';
            targetClientUidInput.value = '';
            showConfirmation(adminQuestionConfirmation, 'Votre question a été envoyée au client.', 'success');
        } catch (error) {
            console.error("Erreur d'envoi de la question admin:", error);
            showConfirmation(adminQuestionConfirmation, "Erreur d'envoi.", 'error');
        }
    }
});

function showConfirmation(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `message-feedback ${type}`;
    element.style.display = 'block';
    setTimeout(() => { element.style.display = 'none'; }, 4000);
}


// --- GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION (POINT D'ENTRÉE) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        let isAdminByClaim = false;
        try {
            const idTokenResult = await user.getIdTokenResult(true);
            if (idTokenResult.claims.admin === true) {
                isAdminByClaim = true;
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des claims du jeton :", error);
        }
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        if (isAdminByClaim) {
            showAdminView(user);
        } else {
            showClientView(user);
        }
    } else {
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
    }
});


// --- GESTION DE LA LIGHTBOX ET DES ÉVÉNEMENTS ADMIN ---
function openLightbox(url) {
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-image');
    if (lightbox && lightboxImg) {
        lightbox.style.display = "flex";
        lightboxImg.src = url;
    }
}

document.addEventListener('DOMContentLoaded', () => {
  const lightbox = document.getElementById('image-lightbox');
  const closeBtn = document.querySelector('.lightbox-close');

  if (closeBtn) closeBtn.addEventListener('click', () => lightbox.style.display = "none");
  if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.style.display = "none"; });
  
  adminQuestionsContainer?.addEventListener('click', async (event) => {
        const target = event.target;
        const questionId = target.dataset.questionId;
        if (!questionId) return;
        const questionRef = doc(db, 'questions', questionId);

        if (target.classList.contains('reply-button') || target.classList.contains('edit-reply-button')) {
            const form = document.getElementById(`reply-form-${questionId}`);
            if (form) form.style.display = 'block';
            if (target.classList.contains('edit-reply-button')) {
                const docSnap = await firebaseGetDoc(questionRef);
                form.querySelector('textarea').value = docSnap.data().reponse || '';
            }
        }

        if (target.classList.contains('submit-reply-button')) {
            const form = target.closest('div[id^="reply-form-"]');
            const textarea = form.querySelector('textarea');
            if (textarea.value.trim()) {
                try {
                    await updateDoc(questionRef, { reponse: textarea.value, timestampReponse: serverTimestamp() });
                    form.style.display = 'none';
                    // Recharger la vue admin pour refléter le changement immédiatement
                    loadAdminQuestions();
                } catch (error) {
                    console.error("Erreur lors de l'envoi de la réponse :", error);
                    alert("Erreur d'envoi.");
                }
            }
        }
    });
});