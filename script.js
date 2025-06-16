// Les instances et fonctions Firebase sont exposées via l'objet `window` depuis index.html
const {
    firebaseAuthInstance: auth,
    firebaseDbInstance: db,
    firebaseStorageInstance: storage,
    firebase: fb // Raccourci pour les fonctions de service
} = window;

// Éléments du DOM
const loginContainer = document.getElementById('login-container');
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
const adminQuestionForm = document.getElementById('admin-question-form');
const targetClientUidInput = document.getElementById('target-client-uid');
const adminQuestionText = document.getElementById('admin-question-text');
const adminQuestionConfirmation = document.getElementById('admin-question-confirmation');

// --- Fonctions de chargement de l'UI ---

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
    clientQuestionSection.style.display = 'none'; // L'admin utilise un autre formulaire
    loadAllChantiersForAdmin(); // Pour que l'admin puisse voir les infos de tous les chantiers
    loadAdminQuestions();
}

function loadClientChantiers(uid) {
    const chantiersRef = fb.db.collection(db, 'clients', uid, 'chantier');
    fb.db.onSnapshot(chantiersRef, (snapshot) => {
        chantiersList.innerHTML = '';
        if (snapshot.empty) {
            chantiersList.innerHTML = '<p>Aucun chantier ne vous est actuellement attribué.</p>';
            return;
        }
        snapshot.forEach((doc) => {
            const chantierData = doc.data();
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

function loadAllChantiersForAdmin() {
    // Affiche les chantiers de l'admin lui-même s'il en a
    loadClientChantiers(auth.currentUser.uid);
}

async function loadClientQuestions(uid) {
    const qByClient = fb.db.query(fb.db.collection(db, 'questions'), fb.db.where('userId', '==', uid));
    const qToClient = fb.db.query(fb.db.collection(db, 'questions'), fb.db.where('askedTo', '==', uid));

    const allQuestions = [];

    const unsubByClient = fb.db.onSnapshot(qByClient, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const question = { id: doc.id, ...doc.data(), type: 'byClient' };
            const existingIndex = allQuestions.findIndex(q => q.id === doc.id);
            if (existingIndex > -1) allQuestions[existingIndex] = question;
            else allQuestions.push(question);
        });
        renderClientQuestions(allQuestions);
    });

    const unsubToClient = fb.db.onSnapshot(qToClient, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const question = { id: doc.id, ...doc.data(), type: 'toClient' };
            const existingIndex = allQuestions.findIndex(q => q.id === doc.id);
            if (existingIndex > -1) allQuestions[existingIndex] = question;
            else allQuestions.push(question);
        });
        renderClientQuestions(allQuestions);
    });
    // Vous pouvez stocker unsubByClient et unsubToClient pour vous désabonner plus tard si nécessaire
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
            if (questionData.type === 'toClient') {
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


function loadAdminQuestions() {
    const questionsRef = fb.db.collection(db, 'questions');
    // On ne veut que les questions posées par les clients (celles qui n'ont pas de champ 'askedTo')
    const q = fb.db.query(questionsRef, fb.db.where('askedTo', '==', null), fb.db.orderBy('timestamp', 'desc'));

    fb.db.onSnapshot(q, async (snapshot) => {
        if (!adminQuestionsContainer) return;
        adminQuestionsContainer.innerHTML = '';
        if (snapshot.empty) {
            adminQuestionsContainer.innerHTML = '<p>Aucune question de client en attente.</p>';
            return;
        }

        const userIds = [...new Set(snapshot.docs.map(d => d.data().userId).filter(Boolean))];
        const userDocs = await Promise.all(userIds.map(id => fb.db.getDoc(fb.db.doc(db, 'clients', id))));
        const userNameMap = new Map(userDocs.map(d => [d.id, d.exists() ? d.data().nom : `Client inconnu`]));

        snapshot.docs.forEach((docSnap) => {
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
    }, (error) => {
        console.error("Erreur de récupération des questions admin:", error);
    });
}


// --- Écouteurs d'événements pour les formulaires ---

questionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionText.value.trim();
    if (question && auth.currentUser) {
        try {
            await fb.db.addDoc(fb.db.collection(db, 'questions'), {
                userId: auth.currentUser.uid, // Le client qui pose
                question: question,
                timestamp: fb.db.serverTimestamp()
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
            await fb.db.addDoc(fb.db.collection(db, 'questions'), {
                askedBy: auth.currentUser.uid, // L'admin qui pose
                askedTo: targetUid,            // Le client ciblé
                question: question,
                timestamp: fb.db.serverTimestamp()
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
    element.className = type; // 'success' ou 'error'
    element.style.display = 'block';
    setTimeout(() => { element.style.display = 'none'; }, 3000);
}


// --- GESTIONNAIRE D'ÉTAT D'AUTHENTIFICATION (POINT D'ENTRÉE) ---
fb.auth.onAuthStateChanged(auth, async (user) => {
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


// --- GESTION DE LA LIGHTBOX ---
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
});