import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuração do Firebase (copiada do auth.js) ---
const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDleQ5Y1-o7Uoo3zOXKIm35KljdxJuxvWo",
    authDomain: "banco-de-dados-outlet2-0.firebaseapp.com",
    projectId: "banco-de-dados-outlet2-0",
    storageBucket: "banco-de-dados-outlet2-0.firebasestorage.app",
    messagingSenderId: "917605669915",
    appId: "1:917605669915:web:6a9ee233227cfd250bacbe",
    measurementId: "G-5SZ5F2WKXD"
};

const app = initializeApp(LOCAL_FIREBASE_CONFIG);
const db = getFirestore(app);

// --- Constantes ---
const CLIENT_ROLE = 'cliente';

/**
 * Verifica se o usuário logado tem permissão para ver esta página.
 * Redireciona para o login caso não tenha. (RNF002)
 */
function checkAuth() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || user.role !== CLIENT_ROLE) {
        console.warn('Acesso negado. Redirecionando para o login.');
        window.location.href = '../auth/index.html';
    } else {
        console.log(`Usuário '${user.username}' autenticado com sucesso como '${user.role}'.`);
        // Futuramente, aqui iniciaremos os listeners do Firestore.
    }
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    // Outras funções de inicialização virão aqui.
});

