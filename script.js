[⚠️ Suspicious Content] import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, query, onSnapshot, doc, addDoc, serverTimestamp, orderBy as firestoreOrderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";

document.addEventListener('DOMContentLoaded', () => {

    const firebaseConfig = {
        apiKey: "AIzaSyDMRyfYvujCFP3cdmm8UssoMD6crTR3Gp8",
        authDomain: "suivi-chantier-societe.firebaseapp.com",
        projectId: "suivi-chantier-societe",
        storageBucket: "suivi-chantier-societe.firebasestorage.app",
        messagingSenderId: "888449140099",
        appId: "1:888449140099:web:a11dd777d9aa2a839662b6"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

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
    const adminSection = document.getElementById('admin-section');
    const testSetAdminButton = document.getElementById('test-set-admin-button');
    const testRemoveAdminButton = document.getElementById('test-remove-admin-button');
    const testAdminUidInput = document.getElementById('test-admin-uid');
    const testAdminStatus = document.getElementById('test-admin-status');

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

    function renderChantier(chantierDoc, isAdmin) {
        const chantierData = chantierDoc.data();
        const chantierId = chantierDoc.id;
        const clientId = chantierDoc.ref.parent.parent.id;

        const chantierWrapper = document.createElement('div');
        chantierWrapper.classList.add('chantier-item');
        
        chantierWrapper.innerHTML = `
            <h3>Chantier à : ${chantierData.adresse || 'Adresse non spécifiée'}</h3>
            <p><strong>Avancement :</strong> ${chantierData.pourcentageAvancement || 0}%</p>
            <h4>Photos :</h4>
            <div class="photos-container">
                ${(chantierData.photos && chantierData.photos.length) ? chantierData.photos.map(url => `<img src="${url}" alt="Photo du chantier">`).join('') : 'Aucune photo pour le moment.'}
            </div>
            <div class="chat-section">
                <h4>Questions & Réponses</h4>
                <div class="chat-box" id="chat-box-${chantierId}">
                    <p>Chargement des messages...</p>
                </div>
                <form class="chat-form" data-chantier-id="${chantierId}" data-client-id="${clientId}">
                    <textarea required placeholder="Posez votre question ici..."></textarea>
                    <button type="submit">Envoyer</button>
                </form>
            </div>
        `;
        
        chantiersList.appendChild(chantierWrapper);
        
        // Démarrer l'écouteur pour les messages de ce chantier spécifique
        listenForChatMessages(clientId, chantierId, isAdmin);
    }

    function listenForChatMessages(clientId, chantierId, isAdmin) {
        const chatBox = document.getElementById(`chat-box-${chantierId}`);
        const q = query(collection(db, 'clients', clientId, 'chantier', chantierId, 'questions'), firestoreOrderBy('timestamp', 'asc'));
        
        onSnapshot(q, (snapshot) => {
            if (!chatBox) return;
            chatBox.innerHTML = '';
            if (snapshot.empty) {
                chatBox.innerHTML = '<p>Aucun message. Soyez le premier à poser une question !</p>';
                return;
            }
            snapshot.forEach(doc => {
                const messageData = doc.data();
                const messageDiv = document.createElement('div');
                messageDiv.classList.add('chat-message');
                
                const senderIsAdmin = messageData.author === 'admin';
                messageDiv.classList.add(senderIsAdmin ? 'message-received' : 'message-sent');
                if (isAdmin) {
                    messageDiv.classList.toggle('message-sent', senderIsAdmin);
                    messageDiv.classList.toggle('message-received', !senderIsAdmin);
                }

                messageDiv.innerHTML = `
                    <p>${messageData.text}</p>
                    <div class="meta">${new Date(messageData.timestamp.seconds * 1000).toLocaleString()}</div>
                `;
                chatBox.appendChild(messageDiv);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        });
    }

    chantiersList.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!e.target.matches('.chat-form')) return;

        const form = e.target;
        const textarea = form.querySelector('textarea');
        const text = textarea.value.trim();
        const { chantierId, clientId } = form.dataset;

        if (text && auth.currentUser) {
            const messageData = {
                text: text,
                author: auth.currentUser.uid,
                timestamp: serverTimestamp()
            };
            // Si c'est l'admin qui écrit, on stocke "admin" pour une identification facile
            const idTokenResult = await auth.currentUser.getIdTokenResult();
            if (idTokenResult.claims.admin) {
                messageData.author = 'admin';
            }
            
            const questionsRef = collection(db, 'clients', clientId, 'chantier', chantierId, 'questions');
            await addDoc(questionsRef, messageData);
            textarea.value = '';
        }
    });
    
    chantiersList.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
            openLightbox(e.target.src);
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'block';
            const idTokenResult = await user.getIdTokenResult(true);
            const isAdmin = idTokenResult.claims.admin === true;

            chantiersList.innerHTML = ''; // Vider la liste
            if (isAdmin) {
                appTitle.textContent = "Espace Administration";
                adminSection.style.display = 'block';
                // L'admin voit tous les chantiers de tous les clients
                const clientsSnapshot = await getDocs(collection(db, 'clients'));
                clientsSnapshot.forEach(clientDoc => {
                    const chantiersRef = collection(db, 'clients', clientDoc.id, 'chantier');
                    onSnapshot(chantiersRef, (chantiersSnapshot) => {
                         chantiersSnapshot.forEach(chantierDoc => {
                            // On pourrait vérifier si le chantier est déjà affiché pour éviter les doublons
                            if(!document.getElementById(`chat-box-${chantierDoc.id}`)){
                                renderChantier(chantierDoc, true);
                            }
                         });
                    });
                });
            } else {
                appTitle.textContent = "Suivi de vos chantiers";
                adminSection.style.display = 'none';
                const chantiersRef = collection(db, 'clients', user.uid, 'chantier');
                 onSnapshot(chantiersRef, (chantiersSnapshot) => {
                     chantiersList.innerHTML = '';
                     if(chantiersSnapshot.empty){
                         chantiersList.innerHTML = '<p>Aucun chantier ne vous est actuellement attribué.</p>';
                     } else {
                         chantiersSnapshot.forEach(chantierDoc => {
                            renderChantier(chantierDoc, false);
                         });
                     }
                 });
            }
        } else {
            loginContainer.style.display = 'block';
            appContainer.style.display = 'none';
        }
    });

    function openLightbox(url) {
        const lightbox = document.getElementById('image-lightbox');
        const lightboxImg = document.getElementById('lightbox-image');
        if (lightbox && lightboxImg) {
            lightbox.style.display = "flex";
            lightboxImg.src = url;
        }
    }

    const lightbox = document.getElementById('image-lightbox');
    const closeBtn = document.querySelector('.lightbox-close');
    if (closeBtn) closeBtn.addEventListener('click', () => lightbox.style.display = "none");
    if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.style.display = "none"; });

    const callSetUserAdminStatus = async (makeAdmin) => {
        const user = auth.currentUser;
        const targetAdminUID = document.getElementById('test-admin-uid').value.trim();
        const testAdminStatus = document.getElementById('test-admin-status');
        if (!user || !targetAdminUID) {
            testAdminStatus.textContent = "Connectez-vous et entrez un UID.";
            return;
        }
        testAdminStatus.textContent = "Appel en cours...";
        try {
            const idToken = await user.getIdToken();
            const functionUrl = "https://us-central1-suivi-chantier-societe.cloudfunctions.net/setUserAsAdmin";
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ data: { uid: targetAdminUID, isAdmin: makeAdmin } })
            });
            if (!response.ok) { throw new Error(`Erreur HTTP ${response.status}: ${await response.text()}`); }
            const result = await response.json();
            testAdminStatus.textContent = "Succès ! " + result.data.message + " Reconnectez-vous.";
        } catch (error) {
            testAdminStatus.textContent = "Erreur : " + error.message;
        }
    };
    if (testSetAdminButton) testSetAdminButton.addEventListener('click', () => callSetUserAdminStatus(true));
    if (testRemoveAdminButton) testRemoveAdminButton.addEventListener('click', () => callSetUserAdminStatus(false));
});