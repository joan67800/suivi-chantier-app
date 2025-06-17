import { getFirestore, collection, query, where, onSnapshot, getDocs, doc, addDoc, updateDoc, deleteField, serverTimestamp, orderBy as firestoreOrderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getDoc as firebaseGetDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// On récupère l'instance 'app' initialisée dans index.html
const app = window.firebaseApp;

// On initialise les services à partir de l'instance 'app'
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Éléments du DOM
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app-container');
const appTitle = document.getElementById('app-title');
const logoutButton = document.getElementById('logout-button');
const chantiersList = document.getElementById('chantiers-list');
const clientQuestionSection = document.getElementById('client-question-section');
const questionsContainer = document.getElementById('questions-container');
const questionForm = document.getElementById('question-form');
const questionText = document.getElementById('question-text');
const questionConfirmation = document.getElementById('question-confirmation');
const adminSection = document.getElementById('admin-section');
const adminQuestionsContainer = document.getElementById('admin-questions-container');
const uploadPhotoForm = document.getElementById('upload-photo-form');
const photoFileInput = document.getElementById('photo-file');
const uploadStatus = document.getElementById('upload-status');
const adminQuestionForm = document.getElementById('admin-question-form');
const adminQuestionText = document.getElementById('admin-question-text');
const adminQuestionConfirmation = document.getElementById('admin-question-confirmation');
const adminClientList = document.getElementById('admin-client-list');
const clientUidSelect = document.getElementById('client-uid-select');
const targetClientUidSelect = document.getElementById('target-client-uid-select');
const chantierIdSelect = document.getElementById('chantier-id-select');


// --- Fonctions Login / Logout ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, loginForm.email.value, loginForm.password.value);
    } catch (error) {
        loginError.textContent = 'Erreur de connexion : Identifiants incorrects.';
    }
});

logoutButton.addEventListener('click', () => signOut(auth));


// --- Fonctions de chargement de l'UI ---
function showView(isClient) {
    adminSection.style.display = isClient ? 'none' : 'block';
    clientQuestionSection.style.display = isClient ? 'block' : 'none';
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
                <p><strong>Avancement :</strong> ${chantierData.pourcentageAvancement || 0}%</p>
                <h4>Photos :</h4>`;
            const photosContainer = document.createElement('div');
            photosContainer.classList.add('photos-container');
            if (chantierData.photos?.length) {
                chantierData.photos.forEach(photoUrl => {
                    const img = document.createElement('img');
                    img.src = photoUrl;
                    img.alt = "Photo du chantier";
                    img.addEventListener('click', () => openLightbox(photoUrl));
                    photosContainer.appendChild(img);
                });
            } else {
                photosContainer.textContent = 'Aucune photo pour le moment.';
            }
            chantierDiv.appendChild(photosContainer);
            chantiersList.appendChild(chantierDiv);
        });
    });
}

async function loadChantiersForClientSelect(clientId) {
    chantierIdSelect.innerHTML = '<option value="">Chargement...</option>';
    chantierIdSelect.disabled = true;
    if (!clientId) {
        chantierIdSelect.innerHTML = '<option value="">Sélectionnez d\'abord un client</option>';
        return;
    }
    try {
        const chantiersRef = collection(db, 'clients', clientId, 'chantier');
        const chantiersSnapshot = await getDocs(chantiersRef);
        chantierIdSelect.innerHTML = '<option value="">-- Sélectionnez un chantier --</option>';
        if (chantiersSnapshot.empty) {
            chantierIdSelect.innerHTML = '<option value="">Aucun chantier pour ce client</option>';
        } else {
            chantiersSnapshot.forEach(docSnap => {
                const chantierData = docSnap.data();
                const optionText = chantierData.adresse || `Chantier ID: ${docSnap.id}`;
                chantierIdSelect.add(new Option(optionText, docSnap.id));
            });
            chantierIdSelect.disabled = false;
        }
    } catch (error) {
        chantierIdSelect.innerHTML = '<option value="">Erreur de chargement</option>';
    }
}

async function loadClientListForAdmin() {
    try {
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        adminClientList.innerHTML = '';
        const defaultOption = '<option value="">-- Sélectionnez un client --</option>';
        clientUidSelect.innerHTML = defaultOption;
        targetClientUidSelect.innerHTML = defaultOption;
        loadChantiersForClientSelect(null);
        if (clientsSnapshot.empty) {
            adminClientList.textContent = 'Aucun client trouvé.';
            return;
        }
        const clientListUl = document.createElement('ul');
        clientsSnapshot.forEach(docSnap => {
            const clientData = docSnap.data();
            const clientName = clientData.nom || 'Client sans nom';
            const clientId = docSnap.id;
            const li = document.createElement('li');
            li.innerHTML = `<strong>${clientName}:</strong> <code>${clientId}</code>`;
            clientListUl.appendChild(li);
            [clientUidSelect, targetClientUidSelect].forEach(select => {
                select.add(new Option(`${clientName} (${clientId})`, clientId));
            });
        });
        adminClientList.appendChild(clientListUl);
    } catch(error) {
        adminClientList.textContent = 'Erreur de chargement.';
    }
}

async function loadClientQuestions(uid) {
    const q = query(collection(db, 'questions'), where('userId', '==', uid));
    onSnapshot(q, (snapshot) => renderQuestions(snapshot, questionsContainer, false));
}

async function loadAdminQuestions() {
    const q = query(collection(db, 'questions'), firestoreOrderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => renderQuestions(snapshot, adminQuestionsContainer, true));
}

async function renderQuestions(snapshot, container, isAdminView) {
    if (!container) return;
    container.innerHTML = '';
    if (snapshot.empty) {
        container.innerHTML = `<p>${isAdminView ? 'Aucune question de client.' : 'Aucune question.'}</p>`;
        return;
    }
    let users = {};
    if (isAdminView) {
        const userIds = [...new Set(snapshot.docs.map(d => d.data().userId).filter(Boolean))];
        const userDocs = await Promise.all(userIds.map(id => firebaseGetDoc(doc(db, 'clients', id))));
        userDocs.forEach(d => { if(d.exists()) users[d.id] = d.data().nom || 'Client inconnu'; });
    }
    const questionPromises = snapshot.docs.map(async (docSnap) => {
        const questionData = docSnap.data();
        if (isAdminView && !questionData.userId) return '';
        const header = isAdminView ? `<p><strong>Client :</strong> ${users[questionData.userId] || `UID: ${questionData.userId}`} (<code>${questionData.userId}</code>)</p>` : '';
        return `<div class="question-item ${questionData.askedBy ? 'question-from-admin' : ''}">
                    ${header}
                    <p><strong>Question :</strong> ${questionData.question}</p>
                    <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                    ${questionData.reponse ? `<div class="reponse-admin"><p><strong>Réponse :</strong> ${questionData.reponse}</p>${isAdminView ? `<button class="edit-reply-button" data-question-id="${docSnap.id}">Modifier</button>` : ''}</div>` : 
                    (isAdminView ? `<button class="reply-button" data-question-id="${docSnap.id}">Répondre</button>` : '<p><em>En attente de réponse...</em></p>')}
                    ${isAdminView ? `<div id="reply-form-${docSnap.id}" style="display: none; margin-top: 10px;"><textarea>${questionData.reponse || ''}</textarea><button class="submit-reply-button" data-question-id="${docSnap.id}">Envoyer</button></div>` : ''}
                </div>`;
    });
    container.innerHTML = (await Promise.all(questionPromises)).join('');
}


// --- Écouteurs d'événements pour les formulaires ---
uploadPhotoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientUid = clientUidSelect.value;
    const chantierId = chantierIdSelect.value;
    const file = photoFileInput.files[0];
    if (!file || !clientUid || !chantierId) {
        showConfirmation(uploadStatus, 'Veuillez sélectionner un client, un chantier et un fichier.', 'error');
        return;
    }
    showConfirmation(uploadStatus, 'Vérification...', 'info');
    try {
        const chantierRef = doc(db, 'clients', clientUid, 'chantier', chantierId);
        const docSnap = await firebaseGetDoc(chantierRef);
        if (!docSnap.exists()) throw new Error("Le chantier sélectionné n'existe pas.");
        const storageRef = ref(storage, `chantier-photos/${chantierId}/${Date.now()}-${file.name}`);
        showConfirmation(uploadStatus, 'Upload en cours...', 'info');
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(chantierRef, { photos: arrayUnion(downloadURL) });
        showConfirmation(uploadStatus, 'Photo uploadée avec succès !', 'success');
        uploadPhotoForm.reset();
        chantierIdSelect.innerHTML = '<option value="">Sélectionnez d\'abord un client</option>';
        chantierIdSelect.disabled = true;
    } catch (error) {
        showConfirmation(uploadStatus, 'Erreur : ' + error.message, 'error');
    }
});
questionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionText.value.trim();
    if (question && auth.currentUser) {
        await addDoc(collection(db, 'questions'), { userId: auth.currentUser.uid, question: question, timestamp: serverTimestamp() });
        questionText.value = '';
        showConfirmation(questionConfirmation, 'Votre question a été envoyée.', 'success');
    }
});
adminQuestionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = adminQuestionText.value.trim();
    const targetUid = targetClientUidSelect.value;
    if (question && targetUid && auth.currentUser) {
        await addDoc(collection(db, 'questions'), { askedBy: auth.currentUser.uid, askedTo: targetUid, question: question, timestamp: serverTimestamp() });
        adminQuestionText.value = '';
        showConfirmation(adminQuestionConfirmation, 'Question envoyée au client.', 'success');
    }
});

function showConfirmation(element, message, type) {
    if (!element) return;
    element.textContent = message;
    element.className = `message-feedback ${type}`;
    element.style.display = 'block';
    setTimeout(() => { element.style.display = 'none'; }, 4000);
}

// --- GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        const idTokenResult = await user.getIdTokenResult(true);
        const isAdmin = idTokenResult.claims.admin === true;
        if (isAdmin) {
            appTitle.textContent = "Espace Administration";
            showView(false);
            loadAdminQuestions();
            loadClientListForAdmin();
        } else {
            appTitle.textContent = "Suivi de vos chantiers";
            showView(true);
            loadClientChantiers(user.uid);
            loadClientQuestions(user.uid);
        }
    } else {
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
    }
});

// --- GESTION LIGHTBOX & ADMIN ---
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

  clientUidSelect?.addEventListener('change', () => {
    loadChantiersForClientSelect(clientUidSelect.value);
  });
  
  adminQuestionsContainer?.addEventListener('click', async (event) => {
        const target = event.target;
        const questionId = target.dataset.questionId;
        if (!questionId) return;
        const questionRef = doc(db, 'questions', questionId);
        if (target.matches('.reply-button, .edit-reply-button')) {
            const form = document.getElementById(`reply-form-${questionId}`);
            if (form) form.style.display = 'block';
        }
        if (target.matches('.submit-reply-button')) {
            const form = target.closest('div[id^="reply-form-"]');
            const textarea = form.querySelector('textarea');
            if (textarea.value.trim()) {
                await updateDoc(questionRef, { reponse: textarea.value, timestampReponse: serverTimestamp() });
                form.style.display = 'none';
            }
        }
    });
});