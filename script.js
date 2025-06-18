[⚠️ Suspicious Content] import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, getDocs, doc, addDoc, updateDoc, deleteField, serverTimestamp, orderBy as firestoreOrderBy, arrayUnion } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getDoc as firebaseGetDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";


function startApp() {
    const firebaseConfig = {
        apiKey: "AIzaSyDMRyfYvujCFP3cdmm8UssoMD6crTR3Gp8",
        authDomain: "suivi-chantier-societe.firebaseapp.com",
        projectId: "suivi-chantier-societe",
        storageBucket: "suivi-chantier-societe.firebasestorage.app",
        messagingSenderId: "888449140099",
        appId: "1:888449140099:web:a11dd777d9aa2a839662b6",
        measurementId: "G-2KTWHDGT3S"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LfDVkYrAAAAACsz-wqYEudXc32pkr38Oy6fPwFU'),
      isTokenAutoRefreshEnabled: true
    });

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
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');

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

    function showView(isClient) {
        adminSection.style.display = isClient ? 'none' : 'block';
        clientQuestionSection.style.display = isClient ? 'block' : 'none';
    }

    function loadClientChantiers(uid) { /* ... fonction inchangée ... */ }
    async function loadChantiersForClientSelect(clientId) { /* ... fonction inchangée ... */ }
    async function loadClientListForAdmin() { /* ... fonction inchangée ... */ }

    // MODIFIÉ : la logique de chargement et d'affichage a été revue
    async function loadQuestions(uid, isAdminView) {
        const container = isAdminView ? adminQuestionsContainer : questionsContainer;
        if (!container) return;
        container.innerHTML = '<p>Chargement des questions...</p>';

        let q;
        if (isAdminView) {
            q = query(collection(db, 'questions'), firestoreOrderBy('timestamp', 'desc'));
        } else {
            const q1 = query(collection(db, 'questions'), where('userId', '==', uid));
            const q2 = query(collection(db, 'questions'), where('askedTo', '==', uid));
            // Pour le client, on écoute les deux requêtes
            onSnapshot(q1, (snap1) => onSnapshot(q2, (snap2) => {
                const allDocs = [...snap1.docs, ...snap2.docs];
                renderQuestions(allDocs, container, false);
            }));
            return;
        }
        onSnapshot(q, (snapshot) => renderQuestions(snapshot.docs, container, true));
    }
    
    // MODIFIÉ : pour gérer le statut et le bouton "Résoudre"
    async function renderQuestions(docs, container, isAdminView) {
        if (!container) return;
        container.innerHTML = '';
        if (docs.length === 0) {
            container.innerHTML = `<p>${isAdminView ? 'Aucune question de client pour le moment.' : 'Aucune question.'}</p>`;
            return;
        }
        let users = {};
        if (isAdminView) {
            const userIds = [...new Set(docs.map(d => d.data().userId).filter(Boolean))];
            const userDocs = await Promise.all(userIds.map(id => firebaseGetDoc(doc(db, 'clients', id))));
            userDocs.forEach(d => { if(d.exists()) users[d.id] = d.data().nom || 'Client inconnu'; });
        }

        const sortedDocs = docs
            .map(d => ({id: d.id, ...d.data()}))
            .sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        sortedDocs.forEach((questionData) => {
            if (isAdminView && !questionData.userId) return;

            const questionDiv = document.createElement('div');
            questionDiv.classList.add('question-item');
            if (questionData.askedBy) questionDiv.classList.add('question-from-admin');
            
            const clientName = isAdminView ? users[questionData.userId] : '';
            const header = isAdminView ? `<p><strong>Client :</strong> ${clientName} (<code>${questionData.userId}</code>)</p>` : '';
            
            const status = questionData.status || 'ouverte';
            const statusBadge = `<span class="question-status status-${status}">${status}</span>`;
            
            let actionButton = '';
            if (isAdminView) { // Vue Admin
                if (!questionData.reponse) {
                    actionButton = `<button class="reply-button" data-question-id="${questionData.id}">Répondre</button>`;
                }
            } else { // Vue Client
                if (status === 'ouverte') {
                     actionButton = `<button class="resolve-button" data-question-id="${questionData.id}">Marquer comme résolue</button>`;
                }
            }

            questionDiv.innerHTML = `
                ${statusBadge}
                ${header}
                <p><strong>Question :</strong> ${questionData.question}</p>
                <p><em>Posée le : ${questionData.timestamp ? new Date(questionData.timestamp.seconds * 1000).toLocaleString() : 'Date inconnue'}</em></p>
                ${questionData.reponse ? `<div class="reponse-admin"><p><strong>Réponse :</strong> ${questionData.reponse}</p>${isAdminView ? `<button class="edit-reply-button" data-question-id="${questionData.id}">Modifier</button>` : ''}</div>` : ''}
                ${actionButton}
                ${isAdminView ? `<div id="reply-form-${questionData.id}" style="display: none; margin-top: 10px;"><textarea>${questionData.reponse || ''}</textarea><button class="submit-reply-button" data-question-id="${questionData.id}">Envoyer</button></div>` : ''}
            `;
            container.appendChild(questionDiv);
        });
    }

    // Écouteurs d'événements pour les formulaires
    questionForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = questionText.value.trim();
        if (question && auth.currentUser) {
            await addDoc(collection(db, 'questions'), {
                userId: auth.currentUser.uid,
                question: question,
                timestamp: serverTimestamp(),
                status: 'ouverte' // NOUVEAU : Statut par défaut
            });
            questionText.value = '';
            showConfirmation(questionConfirmation, 'Votre question a été envoyée.', 'success');
        }
    });

    uploadPhotoForm?.addEventListener('submit', (e) => { /* ... Logique inchangée ... */ });
    adminQuestionForm?.addEventListener('submit', (e) => { /* ... Logique inchangée ... */ });

    function showConfirmation(element, message, type) { /* ... fonction inchangée ... */ }

    // GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            const idTokenResult = await user.getIdTokenResult(true);
            const isAdmin = idTokenResult.claims.admin === true;
            if (isAdmin) {
                appTitle.textContent = "Espace Administration";
                showView(false);
                loadQuestions(user.uid, true);
                loadClientListForAdmin();
            } else {
                appTitle.textContent = "Suivi de vos chantiers";
                showView(true);
                loadClientChantiers(user.uid);
                loadQuestions(user.uid, false);
            }
        } else {
            loginContainer.style.display = 'block';
            appContainer.style.display = 'none';
        }
    });

    // GESTION LIGHTBOX & ACTIONS
    function openLightbox(url) { /* ... fonction inchangée ... */ }

    document.addEventListener('DOMContentLoaded', () => {
        const lightbox = document.getElementById('image-lightbox');
        const closeBtn = document.querySelector('.lightbox-close');
        if (closeBtn) closeBtn.addEventListener('click', () => lightbox.style.display = "none");
        if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.style.display = "none"; });

        clientUidSelect?.addEventListener('change', () => {
            loadChantiersForClientSelect(clientUidSelect.value);
        });
        
        // MODIFIÉ : Écouteur d'événement unifié pour les conteneurs de questions
        appContainer.addEventListener('click', async (event) => {
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
            
            // NOUVEAU : Gérer le clic sur le bouton "Marquer comme résolue"
            if (target.matches('.resolve-button')) {
                try {
                    await updateDoc(questionRef, { status: 'resolue' });
                } catch (error) {
                    console.error("Erreur lors de la mise à jour du statut:", error);
                }
            }
        });

        // Le code pour les boutons de test admin reste ici
        const testSetAdminButton = document.getElementById('test-set-admin-button');
        const testRemoveAdminButton = document.getElementById('test-remove-admin-button');
        const testAdminUidInput = document.getElementById('test-admin-uid');
        const testAdminStatus = document.getElementById('test-admin-status');
        const callSetUserAdminStatus = async (makeAdmin) => { /* ... logique inchangée ... */ };
        if (testSetAdminButton) testSetAdminButton.addEventListener('click', () => callSetUserAdminStatus(true));
        if (testRemoveAdminButton) testRemoveAdminButton.addEventListener('click', () => callSetUserAdminStatus(false));
    });
}

// Lancement de l'application
startApp();