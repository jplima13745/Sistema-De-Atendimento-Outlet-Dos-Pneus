// assets/js/auth.js
import { state } from './appState.js';
import { db, collection, query, where, getDocs, USERS_COLLECTION_PATH } from './firebaseConfig.js';
import {
  renderMechanicsManagement,
  renderServiceQueues,
  renderAlignmentQueue,
  renderAlignmentMirror,
  renderReadyJobs,
  calculateAndRenderDailyStats,
  renderSalespersonDropdowns
} from './uiRender.js';
import { setupRealtimeListeners } from './services.js';

// Adicionado para fallback, permitindo o login do gerente para criar novos usuários.
const LEGACY_USERS = {
  'gerente.outlet': { password: 'gerenteitapoa', role: 'manager' },
  'alinhador': { password: 'alinhador123', role: 'aligner' }
};

export const MANAGER_ROLE = 'manager';
export const ALIGNER_ROLE = 'aligner';
export const VENDEDOR_ROLE = 'vendedor';
export const MECANICO_ROLE = 'mecanico';

export function postLoginSetup(username, role) {
  state.isLoggedIn = true;
  state.currentUserRole = role;
  state.userId = username;

  // Interface
  document.getElementById('login-container').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('user-info').textContent = `Usuário: ${username} | Cargo: ${role.toUpperCase()}`;

  // Controle de abas
  const tabServicos = document.getElementById('tab-servicos');
  const tabAlinhamento = document.getElementById('tab-alinhamento');
  const tabMonitor = document.getElementById('tab-monitor');
  const tabAdmin = document.getElementById('tab-admin');
  const tabRemoval = document.getElementById('tab-removal');

  const contentServicos = document.getElementById('servicos');
  const contentAlinhamento = document.getElementById('alinhamento');
  const contentMonitor = document.getElementById('monitor');

  // Elementos do formulário
  const serviceFormContainer = document.querySelector('#servicos .lg\\:col-span-1'); // O container do formulário
  const alignmentFormContainer = document.querySelector('#alinhamento > div > div:first-child');

  if (role === ALIGNER_ROLE) {
    tabServicos.classList.add('aligner-hidden');
    tabMonitor.classList.add('aligner-hidden');
    tabAdmin.classList.add('hidden');
    tabRemoval.classList.add('hidden');
    contentServicos.classList.remove('active');
    contentMonitor.classList.remove('active');
    
    tabAlinhamento.classList.add('active');
    contentAlinhamento.classList.add('active');

    // Esconde o formulário de adição manual para o alinhador
    if (alignmentFormContainer) alignmentFormContainer.classList.add('hidden');
  } else if (role === MANAGER_ROLE) {
    // Restaura a visão completa do Gerente
    tabServicos.classList.remove('aligner-hidden', 'hidden');
    tabAlinhamento.classList.remove('aligner-hidden', 'hidden');
    tabMonitor.classList.remove('aligner-hidden', 'hidden');
    tabAdmin.classList.remove('hidden');
    tabRemoval.classList.remove('hidden');
    
    // Define a aba "Serviços" como a inicial
    tabServicos.classList.add('active');
    contentServicos.classList.add('active');
    tabAlinhamento.classList.remove('active');
    contentAlinhamento.classList.remove('active');
    renderSalespersonDropdowns(); // Popula o dropdown para o gerente
  } else if (role === VENDEDOR_ROLE) {
    // Vendedor vê o formulário de serviço e alinhamento, mas não o monitor e admin
    tabMonitor.classList.add('hidden');
    tabAdmin.classList.add('hidden');
    tabRemoval.classList.remove('hidden');
    
    // Popula, seleciona e desativa o dropdown para o vendedor
    renderSalespersonDropdowns();
    const vendedorSelect = document.getElementById('vendedorName');
    const aliVendedorSelect = document.getElementById('aliVendedorName');
    vendedorSelect.value = username;
    aliVendedorSelect.value = username;
    vendedorSelect.disabled = true;
    aliVendedorSelect.disabled = true;
  } else if (role === MECANICO_ROLE) {
    // Mecânico só vê a aba de serviços, mas com uma visão personalizada
    tabServicos.classList.add('hidden');
    tabAlinhamento.classList.add('hidden');
    tabMonitor.classList.add('hidden');
    tabAdmin.classList.add('hidden');
    tabRemoval.classList.add('hidden');

    // Esconde todos os conteúdos de abas
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Mostra apenas o painel do mecânico
    const mechanicView = document.getElementById('mechanic-view');
    mechanicView.classList.add('active');
  }

  renderMechanicsManagement();

  // 🔥 Ativa os listeners Firestore após login
  if (state.isAuthReady) {
    try {
      setupRealtimeListeners();
      console.log("📡 Firestore listeners iniciados.");
    } catch (e) {
      console.warn("Erro ao iniciar listeners:", e);
    }
  }

  // Renderização inicial
  renderServiceQueues(state.serviceJobs);
  renderAlignmentQueue(state.alignmentQueue);
  renderAlignmentMirror(state.alignmentQueue);
  renderReadyJobs(state.serviceJobs, state.alignmentQueue);
  calculateAndRenderDailyStats();
}

export async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorElement = document.getElementById('login-error');
  errorElement.textContent = '';

  try {
    const usersRef = collection(db, ...USERS_COLLECTION_PATH);
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Prioridade 1: Usuário encontrado no Banco de Dados
      const userDoc = querySnapshot.docs[0];
      const user = userDoc.data();
      if (user.password === password) {
        postLoginSetup(user.username, user.role);
      } else {
        errorElement.textContent = 'Senha incorreta.';
      }
    } else {
      // Prioridade 2: Fallback para usuários legados (hardcoded)
      const legacyUser = LEGACY_USERS[username];
      if (legacyUser && legacyUser.password === password) {
        postLoginSetup(username, legacyUser.role);
      } else {
        errorElement.textContent = 'Usuário não encontrado.';
      }
    }
  } catch (error) {
    console.error("Erro durante o login:", error);
    errorElement.textContent = 'Erro ao conectar com o servidor de autenticação.';
  }
}

export function handleLogout() {
  state.isLoggedIn = false;
  state.currentUserRole = null;
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('login-form').reset();
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-container').classList.remove('hidden');
}
