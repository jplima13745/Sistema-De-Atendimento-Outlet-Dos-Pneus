import { initializeFirebase } from './firebaseConfig.js';
import { handleLogin, handleLogout } from './auth.js';
import { initMechanicsHandlers } from './mechanics.js';
import { state } from './appState.js';

async function initApp() {
  try {
    // 🔥 Inicializa o Firebase antes de qualquer listener ou login
    await initializeFirebase();
    state.isAuthReady = true;
    console.log("✅ Firebase inicializado antes do login.");
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }

  // Wire up login/logout
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  window.handleLogout = handleLogout;

  // Init mechanics handlers
  try {
    initMechanicsHandlers();
  } catch (e) {
    console.warn(e);
  }

  // Tab switching minimal
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      const el = document.getElementById(tab);
      if (el) el.classList.add('active');
    });
  });

  // Expose state for debugging
  window._AT_STATE = state;
}

window.addEventListener('DOMContentLoaded', initApp);
