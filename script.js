import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// NOVO: Adicionado analytics, como no seu snippet (embora não seja usado ativamente, é bom para o setup)
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, setLogLevel, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =========================================================================
// CORREÇÃO PARA EXECUÇÃO LOCAL (LIVE SERVER/PREVIEW)
// =========================================================================
const isCanvasEnvironment = typeof __app_id !== 'undefined';
const LOCAL_APP_ID = 'local-autocenter-app';

const appId = isCanvasEnvironment ? (typeof __app_id !== 'undefined' ? __app_id : LOCAL_APP_ID) : LOCAL_APP_ID;

// ATUALIZADO: Suas chaves reais do Firebase foram inseridas aqui
const LOCAL_FIREBASE_CONFIG = {
    apiKey: "AIzaSyASPbbCpk4A2ZM_imbgoWixsFyMXYrCvQU",
    authDomain: "atendimentosoutlet.firebaseapp.com",
    projectId: "atendimentosoutlet",
    storageBucket: "atendimentosoutlet.firebasestorage.app",
    messagingSenderId: "815053643953",
    appId: "1:815053643953:web:dbf29a57abaa869d1cc290",
    measurementId: "G-JZ7B6ZBGYJ"
};

let firebaseConfig = {};
if (isCanvasEnvironment && typeof __firebase_config !== 'undefined') {
    try {
        firebaseConfig = JSON.parse(__firebase_config);
    } catch (e) {
        console.error("Erro ao fazer parse da configuração do Firebase da plataforma. Usando placeholders.", e);
        firebaseConfig = LOCAL_FIREBASE_CONFIG;
    }
} else {
    firebaseConfig = LOCAL_FIREBASE_CONFIG;
}

const initialAuthToken = (isCanvasEnvironment && typeof __initial_auth_token !== 'undefined') ? __initial_auth_token : null;

let db;
let auth;
let analytics; // NOVO
let userId = 'loading';
let isAuthReady = false;
let isDemoMode = false; // FLAG para Modo Demo

// CORREÇÃO: A verificação de Modo Demo deve checar se a chave AINDA É o placeholder.
if (firebaseConfig.apiKey === "SUA_API_KEY_AQUI") { // O placeholder que estava no index.html
    console.warn("Chaves do Firebase não configuradas. Entrando no Modo Demo.");
    isDemoMode = true;
}
// =========================================================================
// FIM DA CORREÇÃO
// =========================================================================

// =========================================================================
// AUTENTICAÇÃO E PERMISSÕES
// =========================================================================
const USER_CREDENTIALS = {
    'gerente.outlet': { password: 'gerenteitapoa', role: 'manager' },
    'alinhador': { password: 'alinhador123', role: 'aligner' }
};
const MANAGER_ROLE = 'manager';
const ALIGNER_ROLE = 'aligner';

let currentUserRole = null;
let isLoggedIn = false;

// =========================================================================
// Armazenamento em memória para Modo Demo
let serviceJobs = [];
let alignmentQueue = [];
let jobIdCounter = 100;
let aliIdCounter = 200;

// NOVO: ID do job sendo editado no modal
let currentJobToDefineId = null; 

let currentJobToConfirm = { id: null, type: null, confirmAction: null, serviceType: null }; 

// MECÂNICOS ATUALIZADOS (Gerente pode alterar)
let MECHANICS = ['José', 'Wendell']; 
const TIRE_SHOP_MECHANIC = 'Borracheiro'; // Mecânico Fixo

// COLEÇÕES DO FIRESTORE
const SERVICE_COLLECTION_PATH = `/artifacts/${appId}/public/data/serviceJobs`;
const ALIGNMENT_COLLECTION_PATH = `/artifacts/${appId}/public/data/alignmentQueue`;

// STATUS GLOBAIS
const STATUS_PENDING = 'Pendente';
const STATUS_READY = 'Pronto para Pagamento'; 
const STATUS_FINALIZED = 'Finalizado'; // NOVO STATUS

// STATUS DE SERVIÇO GERAL (GS)
const STATUS_GS_FINISHED = 'Serviço Geral Concluído';
const STATUS_TS_FINISHED = 'Serviço Pneus Concluído';
const STATUS_GS_PENDING_TS = 'Pendente (Aguardando Pneus)';
const STATUS_TS_PENDING_GS = 'Pendente (Aguardando GS)';

// STATUS DE ALINHAMENTO
const STATUS_WAITING_GS = 'Aguardando Serviço Geral'; 
const STATUS_WAITING = 'Aguardando'; 
const STATUS_ATTENDING = 'Em Atendimento';

// ------------------------------------
// 1. Configuração e Autenticação
// ------------------------------------

/**
 * NOVO: Configura o estado da UI após o login, baseado no cargo (ROLE)
 */
function postLoginSetup(username, role) {
    isLoggedIn = true;
    currentUserRole = role;
    
    // ESCONDE A TELA DE LOGIN
    document.getElementById('login-container').classList.add('hidden');
    // MOSTRA O CONTEÚDO PRINCIPAL
    document.getElementById('main-content').classList.remove('hidden');

    document.getElementById('user-info').textContent = `Usuário: ${username} | Cargo: ${role.toUpperCase()}`;
    
    // Renderiza o título dos mecânicos e monitor
    const mechanicTitle = MECHANICS.join(', ');
    document.getElementById('mechanic-list-title').textContent = mechanicTitle;
    document.getElementById('mechanic-monitor-title').textContent = mechanicTitle;

    // =========================================================================
    // NOVO: RESTRIÇÃO DE ACESSO PARA ALINHADOR
    // =========================================================================
    const mainNav = document.getElementById('main-nav');
    const tabServicos = document.getElementById('tab-servicos');
    const tabAlinhamento = document.getElementById('tab-alinhamento');
    const tabMonitor = document.getElementById('tab-monitor');
    
    const contentServicos = document.getElementById('servicos');
    const contentAlinhamento = document.getElementById('alinhamento');
    const contentMonitor = document.getElementById('monitor');

    const mechMgmt = document.getElementById('mechanic-management');

    if (role === ALIGNER_ROLE) {
        // Esconde as abas e conteúdos de Serviços e Pagamentos
        tabServicos.classList.add('aligner-hidden');
        tabMonitor.classList.add('aligner-hidden');
        contentServicos.classList.remove('active');
        contentMonitor.classList.remove('active');
        
        // Mostra a aba de Alinhamento como padrão
        tabAlinhamento.classList.add('active');
        contentAlinhamento.classList.add('active');
        
        mechMgmt.classList.add('hidden');

    } else if (role === MANAGER_ROLE) {
        // Garante que o Gerente veja tudo
        tabServicos.classList.remove('aligner-hidden');
        tabMonitor.classList.remove('aligner-hidden');
        
        // Reseta para a aba padrão
        tabServicos.classList.add('active');
        contentServicos.classList.add('active');
        tabAlinhamento.classList.remove('active');
        contentAlinhamento.classList.remove('active');
        
        mechMgmt.classList.remove('hidden');
    }
    // =========================================================================
    // FIM DA RESTRIÇÃO DE ACESSO
    // =========================================================================

    // Atualiza o dropdown e o contador
    renderMechanicsManagement();

    // NOVO: Listeners são ativados APÓS o login
    if (!isDemoMode) {
        setupRealtimeListeners();
    }

    // Re-renderiza tudo para aplicar permissões de botões (mover/ações)
    renderServiceQueues(serviceJobs);
    renderAlignmentQueue(alignmentQueue);
    renderAlignmentMirror(alignmentQueue); 
    renderReadyJobs(serviceJobs, alignmentQueue);
    calculateAndRenderDailyStats(); // NOVO
}

/**
 * NOVO: Função para simular o login
 */
function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    errorElement.textContent = '';

    const user = USER_CREDENTIALS[username];

    if (user && user.password === password) {
        postLoginSetup(username, user.role);
    } else {
        errorElement.textContent = 'Credenciais inválidas. Tente novamente.';
    }
}

/**
 * NOVO: Função de logout
 */
window.handleLogout = function() {
    isLoggedIn = false;
    currentUserRole = null;
    document.getElementById('main-content').classList.add('hidden');
    // Reseta o formulário de login
    document.getElementById('login-form').reset();
    document.getElementById('login-error').textContent = '';
    document.getElementById('login-container').classList.remove('hidden');
}

// Adiciona listener ao formulário de login
    document.getElementById('login-form').addEventListener('submit', handleLogin);


// Função para inicializar o Firebase
function initializeFirebase() {
     // CORREÇÃO DE INICIALIZAÇÃO: Esconde tudo até decidirmos o que mostrar
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');

    if (isDemoMode) {
        document.getElementById('user-info').textContent = `MODO DEMO ATIVO (Dados não persistentes).`;
        isAuthReady = true; // Crucial: Libera a UI imediatamente no modo local
        
        // NO MODO DEMO, MOSTRA A TELA DE LOGIN MANUALMENTE
        document.getElementById('login-container').classList.remove('hidden');
        
        // Renderiza a UI inicial vazia no Modo Demo
        renderServiceQueues(serviceJobs);
        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue); 
        renderReadyJobs(serviceJobs, alignmentQueue); 
        calculateAndRenderDailyStats(); // NOVO
        return;
    }

    // MODO REAL (Canvas OU Local)
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        analytics = getAnalytics(app); // NOVO: Inicializa o Analytics
        setLogLevel('Debug'); // Ativa logs detalhados do Firestore

        onAuthStateChanged(auth, async (user) => {
            
            if (isCanvasEnvironment) {
                // MODO CANVAS: Login automático com token
                if (initialAuthToken) {
                    try {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } catch (e) {
                        console.warn("Falha no Custom Token, usando Anônimo.", e);
                        await signInAnonymously(auth);
                    }
                } else if (!user) {
                    await signInAnonymously(auth);
                }
                
                userId = auth.currentUser?.uid || crypto.randomUUID();
                
                postLoginSetup("DB_User (Gerente)", MANAGER_ROLE); // Auto-login como Gerente no Canvas
                isAuthReady = true;
                // Listeners são chamados dentro do postLoginSetup

            } else {
                // MODO LOCAL (COM CHAVES): Mostra a tela de login manual
                userId = auth.currentUser?.uid || crypto.randomUUID(); // Pega o ID anônimo se houver
                
                if (!user) {
                    // Tenta login anônimo para ter permissão de R/W (se as regras permitirem)
                    try {
                        await signInAnonymously(auth);
                        userId = auth.currentUser.uid;
                    } catch (e) {
                        console.error("Falha no login anônimo (Necessário para Firestore):", e);
                    }
                }
                
                // Mostra a tela de login para o usuário (Gerente/Alinhador)
                document.getElementById('login-container').classList.remove('hidden');
                document.getElementById('main-content').classList.add('hidden');
                isAuthReady = true;
                // Listeners só serão chamados DEPOIS que o usuário fizer o login (via postLoginSetup)
            }
        });
    } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        // Se a inicialização falhar, mostra o erro
        document.getElementById('main-content').classList.remove('hidden'); // Mostra main-content para exibir o erro
        document.getElementById('service-error').textContent = `Erro Fatal: Falha na inicialização do Firebase. Verifique a console.`;
    }
}

// ------------------------------------
// 1.5. Gerenciamento de Mecânicos (Apenas Gerente)
// ------------------------------------

function renderMechanicsManagement() {
    const activeMechSpan = document.getElementById('active-mechanics');
    const removeSelect = document.getElementById('mechanicToRemove');
    const manualSelect = document.getElementById('manualMechanic'); 
    
    const mechanicTitle = MECHANICS.join(', ');
    document.getElementById('mechanic-list-title').textContent = mechanicTitle;
    document.getElementById('mechanic-monitor-title').textContent = mechanicTitle;
    
    activeMechSpan.textContent = mechanicTitle;
    
    // Popula os selects
    let optionsHTML = '<option value="">-- Automático --</option>'; // MUDADO: Padrão é automático
    optionsHTML += MECHANICS.map(m => `<option value="${m}">${m}</option>`).join('');
    
    removeSelect.innerHTML = MECHANICS.map(m => `<option value="${m}">${m}</option>`).join('');
    manualSelect.innerHTML = optionsHTML;

    // Após a atualização dos mecânicos, a fila principal deve ser re-renderizada
    renderServiceQueues(serviceJobs);
    calculateAndRenderDailyStats(); // NOVO: Atualiza stats se mecânicos mudarem
}

document.getElementById('add-mechanic-form').addEventListener('submit', function(e) {
    e.preventDefault();
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem adicionar mecânicos.");

    const newName = document.getElementById('newMechanicName').value.trim();
    if (newName && !MECHANICS.includes(newName)) {
        MECHANICS.push(newName);
        renderMechanicsManagement();
        document.getElementById('newMechanicName').value = '';
        alertUser(`Mecânico ${newName} adicionado com sucesso!`);
    } else if (MECHANICS.includes(newName)) {
        alertUser(`Mecânico ${newName} já existe.`);
    }
});

document.getElementById('remove-mechanic-form').addEventListener('submit', function(e) {
    e.preventDefault();
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem remover mecânicos.");
    
    const nameToRemove = document.getElementById('mechanicToRemove').value;
    if (nameToRemove) {
        MECHANICS = MECHANICS.filter(m => m !== nameToRemove);
        
        if(isDemoMode) {
            serviceJobs.forEach(job => {
                if (job.assignedMechanic === nameToRemove && job.status === STATUS_PENDING) {
                    job.assignedMechanic = MECHANICS[0] || 'N/A'; // Reatribui
                }
            });
        }
        renderMechanicsManagement();
        alertUser(`Mecânico ${nameToRemove} removido.`);
    }
});


// ------------------------------------
// 2. Lógica de Atribuição e Persistência
// ------------------------------------

/**
 * Busca a carga de trabalho atual dos mecânicos GERAIS e retorna o menos ocupado.
 * @returns {Promise<string>} O nome do mecânico menos carregado.
 */
async function getLeastLoadedMechanic() {
    if (MECHANICS.length === 0) {
        throw new Error("Nenhum mecânico (Geral) ativo para atribuição.");
    }

    let jobsToCount = [];

    if (isDemoMode) {
         jobsToCount = serviceJobs.filter(job => job.status === STATUS_PENDING);
    } else {
        try {
            const q = query(
                collection(db, SERVICE_COLLECTION_PATH),
                where('status', '==', STATUS_PENDING)
            );
            const snapshot = await getDocs(q);
            jobsToCount = snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.error("Erro ao consultar Firestore para carga de mecânicos:", e);
            throw new Error("Falha ao calcular a carga de trabalho.");
        }
    }
    
    const load = {};
    MECHANICS.forEach(m => load[m] = 0);

    jobsToCount.forEach(job => {
        if (MECHANICS.includes(job.assignedMechanic)) {
            load[job.assignedMechanic]++;
        }
    });

    console.log("Carga atual dos mecânicos (Geral):", load);

    let leastLoad = Infinity;
    let leastLoadedMechanic = MECHANICS[0];

    for (const mechanic of MECHANICS) {
        if (load[mechanic] < leastLoad) {
            leastLoad = load[mechanic];
            leastLoadedMechanic = mechanic;
        }
    }
    return leastLoadedMechanic;
}


// ------------------------------------
// 3. Handlers de Formulário e Ações
// ------------------------------------

/**
 * Cadastra um novo serviço (Aba 1).
 */
document.getElementById('service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isLoggedIn) return alertUser("Você precisa estar logado para cadastrar serviços.");

    const customerName = document.getElementById('customerName').value.trim();
    const vendedorName = document.getElementById('vendedorName').value.trim();
    const licensePlate = document.getElementById('licensePlate').value.trim().toUpperCase();
    const carModel = document.getElementById('carModel').value.trim();
    
    // MUDANÇA: Lógica de Avaliação
    let serviceDescription = document.getElementById('serviceDescription').value.trim();
    const isServiceDefined = serviceDescription !== '';
    if (!isServiceDefined) {
        serviceDescription = "Avaliação"; // Padrão
    }
    
    const manualSelection = document.getElementById('manualMechanic').value; // Mecânico Geral Manual
    
    const willAlign = document.querySelector('input[name="willAlign"]:checked').value === 'Sim';
    const willTireChange = document.querySelector('input[name="willTireChange"]:checked').value === 'Sim'; // NOVO

    const errorElement = document.getElementById('service-error');
    const messageElement = document.getElementById('assignment-message');
    errorElement.textContent = '';
    messageElement.textContent = 'Atribuindo...';

    if (!isAuthReady) {
        errorElement.textContent = 'Aguardando inicialização do sistema...';
        return;
    }

    let assignedMechanic; // Mecânico Geral
    let assignedTireShop = null; // Borracheiro

    // 1. Atribuição do Mecânico Geral
    if (manualSelection && MECHANICS.includes(manualSelection)) {
        assignedMechanic = manualSelection;
    } else {
        try {
            assignedMechanic = await getLeastLoadedMechanic();
        } catch (e) {
            errorElement.textContent = `Erro na atribuição: ${e.message}`;
            messageElement.textContent = '';
            return;
        }
    }
    
    // 2. Atribuição do Borracheiro (se necessário)
    if (willTireChange) {
        assignedTireShop = TIRE_SHOP_MECHANIC;
    }

    const newJob = {
        customerName,
        vendedorName,
        licensePlate,
        carModel,
        serviceDescription, // "Avaliação" ou o serviço definido
        isServiceDefined, // NOVO: true ou false
        assignedMechanic, // Mecânico Geral (José, Wendell)
        assignedTireShop, // Borracheiro (ou null)
        status: STATUS_PENDING, // Status principal
        statusGS: STATUS_PENDING, // Status do Serviço Geral
        statusTS: willTireChange ? STATUS_PENDING : null, // Status do Serviço de Pneus
        requiresAlignment: willAlign,
        timestamp: isDemoMode ? Timestamp.fromMillis(Date.now()) : serverTimestamp(), // ATUALIZADO
        registeredBy: userId,
        id: `job_${jobIdCounter++}`,
        type: 'Serviço Geral',
        finalizedAt: null // NOVO: Para estatísticas
    };
    
    try {
        if (isDemoMode) {
            serviceJobs.push(newJob);
            
            let statusMessage = `✅ Simulação: Serviço Geral atribuído a ${assignedMechanic}!`;
            if (willTireChange) {
                statusMessage += ` e Serviço de Pneus ao Borracheiro!`;
            }
            
            if (willAlign) {
                const newAlignmentCar = {
                    customerName,
                    vendedorName,
                    licensePlate,
                    carModel,
                    status: STATUS_WAITING_GS, // ENTRA VERMELHO: AGUARDANDO MECÂNICO/BORRACHEIRO
                    gsDescription: newJob.serviceDescription, // Passa "Avaliação"
                    gsMechanic: newJob.assignedMechanic,
                    serviceJobId: newJob.id,
                    timestamp: Timestamp.fromMillis(Date.now() + 10), // ATUALIZADO
                    addedBy: userId,
                    id: `ali_${aliIdCounter++}`,
                    type: 'Alinhamento',
                    finalizedAt: null // NOVO: Para estatísticas
                };
                alignmentQueue.push(newAlignmentCar);
                
                renderAlignmentQueue(alignmentQueue); 
                renderAlignmentMirror(alignmentQueue);
                statusMessage += ` e adicionado à fila de Alinhamento (Aguardando)!`;
            }

            renderServiceQueues(serviceJobs);
            renderReadyJobs(serviceJobs, alignmentQueue);

            errorElement.textContent = "MODO DEMO: Dados não salvos.";
            messageElement.textContent = statusMessage;
        } else {
            // MODO REAL: Adiciona ao Firestore
            const serviceJobId = newJob.id; 
            delete newJob.id; 
            
            const jobRef = await addDoc(collection(db, SERVICE_COLLECTION_PATH), newJob);
            
            if (willAlign) {
                 const newAlignmentCar = {
                    customerName,
                    vendedorName,
                    licensePlate,
                    carModel,
                    status: STATUS_WAITING_GS,
                    gsDescription: newJob.serviceDescription,
                    gsMechanic: newJob.assignedMechanic,
                    timestamp: serverTimestamp(),
                    addedBy: userId,
                    type: 'Alinhamento',
                    serviceJobId: jobRef.id, // Link para o Job principal (ID real do Firestore)
                    finalizedAt: null // NOVO: Para estatísticas
                };
                await addDoc(collection(db, ALIGNMENT_COLLECTION_PATH), newAlignmentCar);
            }
            
            messageElement.textContent = `✅ Serviço Geral atribuído a ${assignedMechanic}!`;
            if (willTireChange) {
                messageElement.textContent += ` e Pneus ao Borracheiro!`;
            }
            if (willAlign) {
                messageElement.textContent += ` e carro na fila de alinhamento (Aguardando GS)!`;
            }
        }

        document.getElementById('service-form').reset();
        setTimeout(() => messageElement.textContent = isDemoMode ? "Modo Demo Ativo." : '', 5000);

    } catch (error) {
        console.error("Erro ao cadastrar serviço:", error);
        errorElement.textContent = `Erro no cadastro: ${error.message}`;
        messageElement.textContent = '';
    }
});

/**
 * Adiciona um carro à fila de alinhamento (manualmente pela aba 2).
 */
document.getElementById('alignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isLoggedIn) return alertUser("Você precisa estar logado para cadastrar serviços.");

    const customerName = document.getElementById('aliCustomerName').value.trim();
    const vendedorName = document.getElementById('aliVendedorName').value.trim();
    const licensePlate = document.getElementById('aliLicensePlate').value.trim().toUpperCase();
    const carModel = document.getElementById('aliCarModel').value.trim();
    const errorElement = document.getElementById('alignment-error');
    errorElement.textContent = '';

    if (!isAuthReady) {
        errorElement.textContent = 'Aguardando inicialização do sistema...';
        return;
    }

    try {
        const newAlignmentCar = {
            customerName,
            vendedorName,
            licensePlate,
            carModel,
            status: STATUS_WAITING, // Manualmente adicionado (Prioridade Alta)
            timestamp: isDemoMode ? Timestamp.fromMillis(Date.now()) : serverTimestamp(), // ATUALIZADO
            addedBy: userId,
            id: `ali_${aliIdCounter++}`,
            type: 'Alinhamento',
            gsDescription: 'N/A (Adicionado Manualmente)',
            gsMechanic: 'N/A',
            finalizedAt: null // NOVO: Para estatísticas
        };

        if (isDemoMode) {
            alignmentQueue.push(newAlignmentCar);
            renderAlignmentQueue(alignmentQueue);
            renderAlignmentMirror(alignmentQueue);
            renderReadyJobs(serviceJobs, alignmentQueue); 
            errorElement.textContent = 'MODO DEMO: Cliente adicionado (Não salvo).';
        } else {
            delete newAlignmentCar.id;
            await addDoc(collection(db, ALIGNMENT_COLLECTION_PATH), newAlignmentCar);
            errorElement.textContent = '✅ Cliente adicionado à fila de alinhamento com sucesso!';
        }

        document.getElementById('alignment-form').reset();
        setTimeout(() => errorElement.textContent = '', 5000);

    } catch (error)
    {
        console.error("Erro ao adicionar à fila de alinhamento:", error);
        errorElement.textContent = `Erro: ${error.message}`;
    }
});

// =========================================================================
// NOVO: Funções de Reordenação da Fila de Alinhamento (Gerente)
// =========================================================================

/**
 * Encontra o carro adjacente (antes ou depois) que pode ser reordenado.
 * Ignora carros que não estão em STATUS_WAITING.
 */
function findAdjacentCar(currentIndex, direction) {
    // Usa a lista renderizada (que já está ordenada)
    const activeCars = getSortedAlignmentQueue();
    
    let adjacentIndex = currentIndex + direction;
    while(adjacentIndex >= 0 && adjacentIndex < activeCars.length) {
        if (activeCars[adjacentIndex].status === STATUS_WAITING) {
            return activeCars[adjacentIndex];
        }
        adjacentIndex += direction;
    }
    return null; // Não encontrou carro adjacente válido
}

/**
 * Move um carro na fila de alinhamento para cima (AUMENTA PRIORIDADE).
 */
async function moveAlignmentUp(docId) {
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem mover carros na fila.");
    
    const sortedQueue = getSortedAlignmentQueue();
    const index = sortedQueue.findIndex(car => car.id === docId);
    if (index === -1 || sortedQueue[index].status !== STATUS_WAITING) return;
    
    const currentCar = sortedQueue[index];
    const carBefore = findAdjacentCar(index, -1);

    if (!carBefore) {
         alertUser("Este carro já está no topo da fila de espera.");
         return;
    }

    // Calcula o novo timestamp (1 segundo antes do carro anterior)
    const newTimeMillis = (getTimestampSeconds(carBefore.timestamp) * 1000) - 1000;
    const newTimestamp = Timestamp.fromMillis(newTimeMillis);

    if (isDemoMode) {
        const jobIndex = alignmentQueue.findIndex(j => j.id === docId);
        alignmentQueue[jobIndex].timestamp = newTimestamp;
        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue);
        return;
    }

    // MODO REAL (FIRESTORE)
    try {
        const docRef = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
        await updateDoc(docRef, { timestamp: newTimestamp });
        alertUser("Ordem da fila atualizada.");
    } catch (e) {
        console.error("Erro ao mover para cima:", e);
        alertUser("Erro ao atualizar a ordem no banco de dados.");
    }
}

/**
 * Move um carro na fila de alinhamento para baixo (DIMINUI PRIORIDADE).
 */
async function moveAlignmentDown(docId) {
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem mover carros na fila.");

    const sortedQueue = getSortedAlignmentQueue();
    const index = sortedQueue.findIndex(car => car.id === docId);
    if (index === -1 || sortedQueue[index].status !== STATUS_WAITING) return;

    const currentCar = sortedQueue[index];
    const carAfter = findAdjacentCar(index, +1);

    if (!carAfter) {
        alertUser("Este carro já é o último na fila de espera.");
        return;
    }
    
    // Calcula o novo timestamp (1 segundoDepois do carro seguinte)
    const newTimeMillis = (getTimestampSeconds(carAfter.timestamp) * 1000) + 1000;
    const newTimestamp = Timestamp.fromMillis(newTimeMillis);


    if (isDemoMode) {
        const jobIndex = alignmentQueue.findIndex(j => j.id === docId);
        alignmentQueue[jobIndex].timestamp = newTimestamp;
        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue);
        return;
    } 
    
    // MODO REAL (FIRESTORE)
    try {
        const docRef = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
        await updateDoc(docRef, { timestamp: newTimestamp });
        alertUser("Ordem da fila atualizada.");
    } catch (e) {
        console.error("Erro ao mover para baixo:", e);
        alertUser("Erro ao atualizar a ordem no banco de dados.");
    }
}

// =========================================================================
// MODAL DE CONFIRMAÇÃO (Robusto, com addEventListener)
// =========================================================================

document.getElementById("confirm-button").addEventListener("click", () => {
    const { id, confirmAction, type, serviceType } = currentJobToConfirm;
    if (!id || !confirmAction) {
        console.warn("Ação de confirmação cancelada.", currentJobToConfirm);
        hideConfirmationModal();
        return;
    }
    
    // NOVO: Verifica o serviceType para o Borracheiro
    if (confirmAction === "service") confirmServiceReady(serviceType);
    if (confirmAction === "alignment") confirmAlignmentReady();
    if (confirmAction === "finalize") confirmFinalizeJob();
});

// Função genérica para mostrar o modal de confirmação
function showConfirmationModal(id, type, title, message, confirmAction, serviceType = null) {
    // NOVO: Adicionado serviceType
    currentJobToConfirm = { id, type, confirmAction, serviceType }; 
    const modal = document.getElementById('confirmation-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').innerHTML = message;
    
    const confirmButton = document.getElementById('confirm-button');
    confirmButton.classList.remove('bg-red-600', 'hover:bg-red-700');
    confirmButton.classList.add('bg-green-600', 'hover:bg-green-700');
    confirmButton.textContent = 'Sim, Confirmar';
    
    modal.classList.remove('hidden');
}

function showFinalizeModal(id, type, title, message, confirmAction) {
    currentJobToConfirm = { id, type, confirmAction, serviceType: null };
    const modal = document.getElementById('confirmation-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').innerHTML = message;
    
    const confirmButton = document.getElementById('confirm-button');
    confirmButton.classList.remove('bg-green-600', 'hover:bg-green-700');
    confirmButton.classList.add('bg-red-600', 'hover:bg-red-700');
    confirmButton.textContent = 'Sim, Finalizar e Receber';

    modal.classList.remove('hidden');
}

window.hideConfirmationModal = function() {
    const modal = document.getElementById('confirmation-modal');
    modal.classList.add('hidden');
    currentJobToConfirm = { id: null, type: null, confirmAction: null, serviceType: null };
}

// Wrapper para Mecânico (Serviço Geral)
window.showServiceReadyConfirmation = function(docId, serviceType) { // 'GS' ou 'TS'
    if (!isLoggedIn) return alertUser("Você precisa estar logado para realizar esta ação.");
    
    const title = serviceType === 'GS' ? 'Confirmar Serviço Geral Concluído' : 'Confirmar Serviço de Pneus Concluído';
    const message = `Tem certeza de que deseja marcar este serviço (${serviceType === 'GS' ? 'Geral' : 'Pneus'}) como PRONTO e liberá-lo?`;
    
    showConfirmationModal(
        docId, 
        'service', 
        title,
        message,
        'service',
        serviceType // Passa 'GS' ou 'TS'
    );
}

// Wrapper para Alinhador
window.showAlignmentReadyConfirmation = function(docId) {
    if (currentUserRole !== MANAGER_ROLE && currentUserRole !== ALIGNER_ROLE) return alertUser("Acesso negado. Faça login como Alinhador ou Gerente.");

     showConfirmationModal(
        docId, 
        'alignment', 
        'Confirmar Alinhamento Concluído',
        'Tem certeza de que o **Alinhamento** está PRONTO e deve ser enviado para a Gerência?',
        'alignment'
    );
}

// Wrapper para Gerente
window.showFinalizeConfirmation = function(docId, collectionType) {
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem finalizar pagamentos.");
    
    const title = collectionType === 'service' ? 'Finalizar Pagamento (Mecânica)' : 'Finalizar Pagamento (Alinhamento)';
    const message = `Confirma a finalização e recebimento do pagamento para o serviço de **${collectionType === 'service' ? 'Mecânica' : 'Alinhamento'}**? Esta ação marcará o carro como 'Finalizado'.`;
    
     showFinalizeModal(
        docId, 
        collectionType, 
        title, 
        message, 
        'finalize'
    );
}

// NOVO: serviceType ('GS' ou 'TS')
window.confirmServiceReady = function(serviceType) {
    if (currentJobToConfirm.id && currentJobToConfirm.confirmAction === 'service') {
        markServiceReady(currentJobToConfirm.id, serviceType); 
    }
    hideConfirmationModal();
}

window.confirmAlignmentReady = function() {
    if (currentJobToConfirm.id && currentJobToConfirm.confirmAction === 'alignment') {
        updateAlignmentStatus(currentJobToConfirm.id, 'Done');
    }
    hideConfirmationModal();
}

window.confirmFinalizeJob = function() {
    if (currentJobToConfirm.id && currentJobToConfirm.confirmAction === 'finalize') {
        finalizeJob(currentJobToConfirm.id, currentJobToConfirm.type);
    }
    hideConfirmationModal();
}

// =========================================================================
// NOVO: Funções do Modal "Definir Serviço"
// =========================================================================

/**
 * Mostra o modal para o Gerente definir o serviço.
 */
window.showDefineServiceModal = function(docId) {
    if (currentUserRole !== MANAGER_ROLE) return; // Segurança extra

    const job = serviceJobs.find(j => j.id === docId);
    if (!job) {
        alertUser("Erro: Serviço não encontrado.");
        return;
    }

    currentJobToDefineId = docId;
    document.getElementById('service-modal-car-info').textContent = `Carro: ${job.carModel} (${job.licensePlate})`;
    
    // Se for "Avaliação", limpa o campo, senão mostra o serviço atual
    const currentDescription = job.serviceDescription === "Avaliação" ? "" : job.serviceDescription;
    document.getElementById('new-service-description').value = currentDescription;
    
    document.getElementById('define-service-modal').classList.remove('hidden');
    document.getElementById('new-service-description').focus();
}

/**
 * Esconde o modal de definição de serviço.
 */
window.hideDefineServiceModal = function() {
    document.getElementById('define-service-modal').classList.add('hidden');
    document.getElementById('define-service-form').reset();
    currentJobToDefineId = null;
}

/**
 * Handler para o submit do formulário do novo modal.
 */
document.getElementById('define-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newDescription = document.getElementById('new-service-description').value.trim();
    const docId = currentJobToDefineId;

    if (!newDescription || !docId) {
        alertUser("A descrição do serviço não pode estar vazia.");
        return;
    }

    const dataToUpdate = {
        serviceDescription: newDescription,
        isServiceDefined: true
    };

    if (isDemoMode) {
        // Atualiza o job principal
        const jobIndex = serviceJobs.findIndex(j => j.id === docId);
        if (jobIndex !== -1) {
            serviceJobs[jobIndex].serviceDescription = newDescription;
            serviceJobs[jobIndex].isServiceDefined = true;
        }
        
        // Atualiza o job de alinhamento associado (se houver)
        const alignmentIndex = alignmentQueue.findIndex(a => a.serviceJobId === docId);
        if (alignmentIndex !== -1) {
            alignmentQueue[alignmentIndex].gsDescription = newDescription;
        }
        
        renderServiceQueues(serviceJobs);
        renderAlignmentMirror(alignmentQueue);
        renderAlignmentQueue(alignmentQueue); // Para garantir que o espelho atualize
    } else {
        // MODO REAL (FIRESTORE)
        try {
            // 1. Atualiza o job principal
            const docRef = doc(db, SERVICE_COLLECTION_PATH, docId);
            await updateDoc(docRef, dataToUpdate);

            // 2. Atualiza o job de alinhamento associado
            const alignQuery = query(collection(db, ALIGNMENT_COLLECTION_PATH), where('serviceJobId', '==', docId));
            const alignSnapshot = await getDocs(alignQuery);
            
            if (!alignSnapshot.empty) {
                const alignDocRef = alignSnapshot.docs[0].ref;
                await updateDoc(alignDocRef, { gsDescription: newDescription });
            }
            
            alertUser("Serviço definido com sucesso!");
        } catch (error) {
            console.error("Erro ao definir serviço:", error);
            alertUser("Erro ao salvar serviço no banco de dados.");
        }
    }
    
    hideDefineServiceModal();
});


/**
 * Marca um serviço (GS ou TS) como PRONTO e verifica se pode liberar o Alinhamento.
 */
async function markServiceReady(docId, serviceType) { // serviceType é 'GS' ou 'TS'
    
    let dataToUpdate = {};
    let alignmentCarRef = null;
    let finalStatus = STATUS_PENDING;

    if (isDemoMode) {
        const jobIndex = serviceJobs.findIndex(j => j.id === docId);
        if (jobIndex === -1) {
            alertUser("Erro Demo: Serviço geral não encontrado.");
            return;
        }
        const job = serviceJobs[jobIndex];

        // 1. Atualiza o status do sub-serviço
        if (serviceType === 'GS') {
            job.statusGS = STATUS_GS_FINISHED;
        } else if (serviceType === 'TS') {
            job.statusTS = STATUS_TS_FINISHED;
        }

        // 2. Verifica se AMBOS estão prontos
        const isGsReady = job.statusGS === STATUS_GS_FINISHED;
        const isTsReady = job.statusTS === STATUS_TS_FINISHED || job.statusTS === null; // Se não houver TS, é considerado pronto

        if (isGsReady && isTsReady) {
            // AMBOS PRONTOS. Libera para próxima etapa.
            if (job.requiresAlignment) {
                // 3a. Libera Alinhamento
                const alignmentCarIndex = alignmentQueue.findIndex(a => a.serviceJobId === docId);
                if (alignmentCarIndex !== -1) {
                    alignmentQueue[alignmentCarIndex].status = STATUS_WAITING;
                    job.status = STATUS_GS_FINISHED; // Status principal do GS
                } else {
                    job.status = STATUS_READY; // Safety net
                }
            } else {
                // 3b. Libera Pagamento (Sem alinhamento)
                job.status = STATUS_READY;
            }
        }
        
        // Re-renderiza tudo
        renderServiceQueues(serviceJobs);
        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue);
        renderReadyJobs(serviceJobs, alignmentQueue);
        return;
    }

    // =========================================================================
    // LÓGICA DO FIRESTORE (MODO REAL)
    // =========================================================================
    try {
        const serviceDocRef = doc(db, SERVICE_COLLECTION_PATH, docId);
        
        // Atualiza o sub-serviço específico
        if (serviceType === 'GS') {
            dataToUpdate.statusGS = STATUS_GS_FINISHED;
        } else if (serviceType === 'TS') {
            dataToUpdate.statusTS = STATUS_TS_FINISHED;
        }
        await updateDoc(serviceDocRef, dataToUpdate);

        // Pega o documento atualizado para verificar se ambos estão prontos
        const serviceDoc = await getDoc(serviceDocRef);
        if (!serviceDoc.exists()) throw new Error("Documento de Serviço não encontrado.");
        
        const job = serviceDoc.data();
        const isGsReady = job.statusGS === STATUS_GS_FINISHED;
        const isTsReady = job.statusTS === STATUS_TS_FINISHED || job.statusTS === null;

        if (isGsReady && isTsReady) {
            // AMBOS PRONTOS. Libera para próxima etapa.
            if (job.requiresAlignment) {
                // 3a. Libera Alinhamento (Procurando pelo serviceJobId)
                const alignQuery = query(
                    collection(db, ALIGNMENT_COLLECTION_PATH),
                    where('serviceJobId', '==', docId),
                    where('status', '==', STATUS_WAITING_GS)
                );
                const alignSnapshot = await getDocs(alignQuery);

                if (!alignSnapshot.empty) {
                    const alignDocRef = alignSnapshot.docs[0].ref;
                    await updateDoc(alignDocRef, { status: STATUS_WAITING });
                    // Atualiza status principal do GS
                    await updateDoc(serviceDocRef, { status: STATUS_GS_FINISHED });
                } else {
                    // Safety net: envia para pronto
                    await updateDoc(serviceDocRef, { status: STATUS_READY });
                }
            } else {
                // 3b. Libera Pagamento (Sem alinhamento)
                await updateDoc(serviceDocRef, { status: STATUS_READY });
            }
        }
    } catch (error) {
        console.error("Erro ao marcar serviço como pronto (Firestore):", error);
        alertUser(`Erro no Banco de Dados: ${error.message}`);
    }
}

 /**
 * Finaliza um serviço (Gerente) - MUDANÇA: AGORA ATUALIZA PARA 'FINALIZADO'
 */
async function finalizeJob(docId, collectionType) {
    if (currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado. Apenas Gerentes podem finalizar pagamentos.");
    
     const collectionPath = collectionType === 'service' ? SERVICE_COLLECTION_PATH : ALIGNMENT_COLLECTION_PATH;
     const isService = collectionType === 'service';
     const finalizedTimestamp = Timestamp.fromMillis(Date.now()); // NOVO

    if (isDemoMode) {
        let jobToUpdate = null;
        if (isService) {
            jobToUpdate = serviceJobs.find(job => job.id === docId);
        } else {
            jobToUpdate = alignmentQueue.find(car => car.id === docId);
            // Finaliza o GS associado também
            if (jobToUpdate && jobToUpdate.serviceJobId) {
                 const associatedGS = serviceJobs.find(job => job.id === jobToUpdate.serviceJobId);
                 if(associatedGS) {
                    associatedGS.status = STATUS_FINALIZED;
                    associatedGS.finalizedAt = finalizedTimestamp;
                 }
            }
        }
        
        if (jobToUpdate) {
            jobToUpdate.status = STATUS_FINALIZED;
            jobToUpdate.finalizedAt = finalizedTimestamp;
        }
        
        // Re-renderiza as listas ativas (que irão filtrar os finalizados)
        renderReadyJobs(serviceJobs, alignmentQueue);
        renderAlignmentMirror(alignmentQueue);
        calculateAndRenderDailyStats(); // NOVO: Atualiza estatísticas
        return;
    }

    // MODO REAL (FIRESTORE)
    try {
        const docRef = doc(db, collectionPath, docId);
        const dataToUpdate = { status: STATUS_FINALIZED, finalizedAt: serverTimestamp() };
        await updateDoc(docRef, dataToUpdate); // Atualiza o principal (Alinhamento ou Serviço)
        
        if (!isService) {
            // Se for Alinhamento, finaliza o GS associado
            const carDoc = await getDoc(docRef);
            if (carDoc.exists() && carDoc.data().serviceJobId) {
                const serviceJobId = carDoc.data().serviceJobId;
                const serviceDocRef = doc(db, SERVICE_COLLECTION_PATH, serviceJobId);
                const serviceDoc = await getDoc(serviceDocRef);
                if (serviceDoc.exists() && serviceDoc.data().status !== STATUS_FINALIZED) {
                    await updateDoc(serviceDocRef, dataToUpdate); // Finaliza o GS também
                }
            }
        }
        // (Removido o deleteDoc)

    } catch (error) {
        console.error("Erro ao finalizar (Firestore):", error);
        alertUser(`Erro no Banco deDados: ${error.message}`);
    }
}


/**
 * Atualiza o status de um item na fila de alinhamento.
 */
async function updateAlignmentStatus(docId, newStatus) {
    if (currentUserRole !== MANAGER_ROLE && currentUserRole !== ALIGNER_ROLE) return alertUser("Acesso negado. Faça login como Alinhador ou Gerente.");
    
    let finalStatus = newStatus;
    let dataToUpdate = {};

    if (newStatus === 'Done') {
        finalStatus = STATUS_READY;
        dataToUpdate = {
            status: finalStatus,
            readyAt: serverTimestamp()
        };
    } else {
        finalStatus = newStatus; // WAITING ou ATTENDING
        dataToUpdate = { status: finalStatus };
    }

    if (isDemoMode) {
         const carIndex = alignmentQueue.findIndex(car => car.id === docId);
         if (carIndex !== -1) {
             alignmentQueue[carIndex].status = finalStatus;
             if (finalStatus === STATUS_READY) {
                 alignmentQueue[carIndex].readyAt = Timestamp.fromMillis(Date.now()); // ATUALIZADO
             }
             renderAlignmentQueue(alignmentQueue);
             renderAlignmentMirror(alignmentQueue);
             renderReadyJobs(serviceJobs, alignmentQueue); 
             return; 
         } else {
            alertUser("Erro Demo: Carro de alinhamento não encontrado.");
         }
         return;
    }

    // MODO REAL (FIRESTORE)
    try {
        const alignDocRef = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
        await updateDoc(alignDocRef, dataToUpdate);
    } catch (error) {
         console.error("Erro ao atualizar status do alinhamento (Firestore):", error);
         alertUser(`Erro no Banco de Dados: ${error.message}`);
    }
}

function alertUser(message) {
    const serviceError = document.getElementById('service-error');
    const alignmentError = document.getElementById('alignment-error');
    
    serviceError.textContent = message;
    alignmentError.textContent = message;
    
    setTimeout(() => {
        serviceError.textContent = isDemoMode ? "As ações não serão salvas." : '';
        alignmentError.textContent = '';
    }, 3000);
}

// ------------------------------------
// 4. Renderização em Tempo Real (onSnapshot)
// ------------------------------------

// Função auxiliar para obter o timestamp em segundos (compatível com Demo e Firestore)
function getTimestampSeconds(timestamp) {
    if (!timestamp) return 0;
    if (typeof timestamp.seconds === 'number') return timestamp.seconds; // Objeto Timestamp do Firestore
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis() / 1000; // Objeto Timestamp do SDK v9+
    return 0; // Fallback
}


/**
 * Renderiza a fila de serviços gerais (Mecânicos e Borracheiro).
 */
function renderServiceQueues(jobs) {
    const mechanicsContainer = document.getElementById('mechanics-queue-display');
    const monitorContainer = document.getElementById('mechanics-monitor');
    const tireShopList = document.getElementById('tire-shop-list');
    const tireShopCount = document.getElementById('tire-shop-count');

    mechanicsContainer.innerHTML = '';
    monitorContainer.innerHTML = '';
    tireShopList.innerHTML = '';
    
    // MUDANÇA: Filtra apenas jobs pendentes
    const pendingJobs = jobs.filter(job => job.status === STATUS_PENDING);

    const groupedJobs = {};
    MECHANICS.forEach(m => groupedJobs[m] = []);
    const tireShopJobs = [];

    pendingJobs.sort((a, b) => getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp));

    pendingJobs.forEach(job => {
        // 1. Fila do Mecânico Geral
        if (job.statusGS === STATUS_PENDING && MECHANICS.includes(job.assignedMechanic)) {
            groupedJobs[job.assignedMechanic].push(job);
        }
        // 2. Fila do Borracheiro
        if (job.statusTS === STATUS_PENDING && job.assignedTireShop === TIRE_SHOP_MECHANIC) {
            tireShopJobs.push(job);
        }
    });

    // Renderiza Fila Borracheiro (Fixo)
    tireShopCount.textContent = `${tireShopJobs.length} Carros`;
    if (tireShopJobs.length > 0) {
         tireShopList.innerHTML = tireShopJobs.map(job => {
            const isGsPending = job.statusGS === STATUS_PENDING;
            const statusText = isGsPending ? `(Aguardando GS: ${job.assignedMechanic})` : '';
            const statusColor = isGsPending ? 'text-red-500' : 'text-gray-500';
            return `
                <li class="p-3 bg-white border-l-4 border-yellow-500 rounded-md shadow-sm flex justify-between items-center">
                    <div>
                        <p class="font-semibold text-gray-800">${job.licensePlate} (${job.carModel})</p>
                        <p class="text-sm ${statusColor}">${job.serviceDescription.substring(0, 30)}... ${statusText}</p>
                    </div>
                    <button onclick="showServiceReadyConfirmation('${job.id}', 'TS')"
                            class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition">
                        Pronto
                    </button>
                </li>
            `;
         }).join('');
    } else {
        tireShopList.innerHTML = '<p class="text-sm text-gray-500 italic p-3 border rounded-md">Nenhum carro na fila. ✅</p>';
    }


    // Renderiza as filas dos Mecânicos Gerais (Dinâmicos)
    if (MECHANICS.length === 0) {
         mechanicsContainer.innerHTML = '<p class="text-sm text-red-600 italic p-3 border rounded-md">Nenhum mecânico geral cadastrado. Por favor, adicione mecânicos na Aba de Serviços.</p>';
    }

    MECHANICS.forEach(mechanic => {
        const jobListHTML = groupedJobs[mechanic].map(job => {
            const isTsPending = job.statusTS === STATUS_PENDING;
            const statusText = isTsPending ? `(Aguardando Pneus)` : '';
            const statusColor = isTsPending ? 'text-red-500' : 'text-gray-500';
            
            // NOVO: Lógica para "Definir Serviço"
            const isManager = currentUserRole === MANAGER_ROLE;
            const isDefined = job.isServiceDefined;
            
            let descriptionHTML = '';
            let clickHandler = '';
            let cursorClass = '';
            
            if (!isDefined) {
                descriptionHTML = '<span class="font-bold text-red-600">(Aguardando Definição de Serviço)</span>';
                if (isManager) {
                    clickHandler = `onclick="showDefineServiceModal('${job.id}')"`;
                    cursorClass = 'cursor-pointer hover:bg-yellow-100/50 transition duration-150';
                    descriptionHTML += '<span class="text-xs text-blue-600 block">(Clique para definir)</span>';
                }
            } else {
                descriptionHTML = `<p class="text-sm ${statusColor}">${job.serviceDescription.substring(0, 30)}... ${statusText}</p>`;
            }

            return `
                <li class="p-3 bg-white border-l-4 border-blue-500 rounded-md shadow-sm flex justify-between items-center ${cursorClass}" ${clickHandler}>
                    <div>
                        <p class="font-semibold text-gray-800">${job.licensePlate} (${job.carModel})</p>
                        ${descriptionHTML}
                    </div>
                    <button onclick="showServiceReadyConfirmation('${job.id}', 'GS')"
                            class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            ${!isDefined ? 'disabled' : ''}>
                        Pronto
                    </button>
                </li>
            `;
        }).join('');

        mechanicsContainer.innerHTML += `
            <div class="mechanic-card bg-gray-50 p-4 rounded-lg shadow-md border border-gray-100">
                <h3 class="text-xl font-bold mb-3 text-gray-800 flex justify-between items-center">
                    ${mechanic}
                    <span class="text-sm font-semibold py-1 px-3 rounded-full ${groupedJobs[mechanic].length > 1 ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'}">
                        ${groupedJobs[mechanic].length} Carros
                    </span>
                </h3>
                <ul class="space-y-2">
                    ${jobListHTML.length > 0 ? jobListHTML : '<p class="text-sm text-gray-500 italic p-3 border rounded-md">Nenhum carro na fila. ✅</p>'}
                </ul>
            </div>
        `;

         // Renderiza os cartões do Monitor (aba 3 - PENDENTE)
        monitorContainer.innerHTML += `
            <div class="p-6 bg-white rounded-xl shadow-lg border border-gray-200 text-center">
                <h3 class="text-2xl font-bold text-gray-800 mb-2">${mechanic}</h3>
                <p class="text-6xl font-extrabold ${groupedJobs[mechanic].length > 1 ? 'text-red-600' : 'text-blue-600'}">
                    ${groupedJobs[mechanic].length}
                </p>
                <p class="text-gray-500 mt-2">Carros Pendentes (Geral)</p>
            </div>
        `;
    });
}

/**
 * Retorna a fila de alinhamento ordenada (usada por render e move)
 */
function getSortedAlignmentQueue() {
     // MUDANÇA: Filtra apenas ativos
     const activeCars = alignmentQueue.filter(car => 
        car.status === STATUS_WAITING || 
        car.status === STATUS_ATTENDING ||
        car.status === STATUS_WAITING_GS
    );
    
    // ATUALIZADO: Ordenação da fila de alinhamento
    activeCars.sort((a, b) => {
        const getPriority = (status) => {
            // Prioridade 1: Em atendimento
            if (status === STATUS_ATTENDING) return 1;
            // Prioridade 2: Disponível (Manual ou GS Pronto)
            if (status === STATUS_WAITING) return 2;
            // Prioridade 3: Aguardando GS
            if (status === STATUS_WAITING_GS) return 3;
            return 4; 
        };
        const priorityA = getPriority(a.status);
        const priorityB = getPriority(b.status);
        
        // Se a prioridade é diferente, ordena pela prioridade
        if (priorityA !== priorityB) return priorityA - priorityB;
        
        // Se a prioridade é a mesma, ordena pelo timestamp (mais antigo primeiro)
        return getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp);
    });
    return activeCars;
}

/**
 * Renderiza o espelho da fila de alinhamento na aba de serviços (mirror).
 */
function renderAlignmentMirror(cars) { // 'cars' é o 'alignmentQueue' bruto
    const mirrorContainer = document.getElementById('alignment-mirror');
    if (!mirrorContainer) return; 
    
    const activeCars = getSortedAlignmentQueue(); // Pega a lista ordenada

    let mirrorHTML = '';
    
    if (activeCars.length === 0) {
         mirrorHTML = '<p class="text-sm text-gray-500 italic p-3 text-center">Fila de Alinhamento vazia. ✅</p>';
    } else {
        mirrorHTML = `
            <ul class="space-y-2">
                ${activeCars.map((car, index) => {
                    const isWaitingGS = car.status === STATUS_WAITING_GS;
                    const isAttending = car.status === STATUS_ATTENDING;

                    const statusClass = isAttending ? 'bg-yellow-100 text-yellow-800' : 
                                        isWaitingGS ? 'bg-red-100 text-red-800' : 
                                        'bg-blue-100 text-blue-800';

                    const gsDescriptionShort = (car.gsDescription && car.gsDescription !== "Avaliação") 
                        ? car.gsDescription.substring(0, 20) + '...' 
                        : 'Avaliação...';
                        
                    const statusText = isAttending ? 'Em Atendimento' : 
                                       isWaitingGS ? `Aguardando GS (${gsDescriptionShort})` : 
                                       'Disponível';
                    
                    return `
                        <li class="p-3 bg-white rounded-md border border-gray-200 shadow-sm flex justify-between items-center text-sm">
                            <span class="font-semibold">${index + 1}. ${car.carModel} (${car.licensePlate})</span>
                            <span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                                ${statusText}
                            </span>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
    }

    mirrorContainer.innerHTML = mirrorHTML;
}


/**
 * Renderiza a fila de alinhamento em formato de tabela (WAITING/ATTENDING/WAITING_GS).
 */
function renderAlignmentQueue(cars) { // 'cars' é o 'alignmentQueue' bruto
    const tableContainer = document.getElementById('alignment-table-container');
    const emptyMessage = document.getElementById('alignment-empty-message');
    
    const activeCars = getSortedAlignmentQueue(); // Pega a lista ordenada

    if (activeCars.length === 0) {
        tableContainer.innerHTML = '';
        tableContainer.appendChild(emptyMessage);
        emptyMessage.style.display = 'block';
        return;
    } else {
        emptyMessage.style.display = 'none';
    }

    let tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo / Placa</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Mover</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
    `;
    
    // Encontra o primeiro carro que está 'Aguardando' (Disponível)
    const nextCarIndex = activeCars.findIndex(c => c.status === STATUS_WAITING);

    activeCars.forEach((car, index) => {
        const isNextWaiting = (index === nextCarIndex);
        const isWaiting = car.status === STATUS_WAITING;
        const isAttending = car.status === STATUS_ATTENDING;
        const isWaitingGS = car.status === STATUS_WAITING_GS;
        
        const statusColor = isAttending ? 'bg-yellow-100 text-yellow-800' : 
                            isWaitingGS ? 'bg-red-100 text-red-800' : 
                            'bg-blue-100 text-blue-800';

        const gsDescriptionShort = (car.gsDescription && car.gsDescription !== "Avaliação") 
            ? car.gsDescription.substring(0, 25) + '...' 
            : 'Avaliação...';
            
        const statusText = isAttending ? 'Em Atendimento' : 
                           isWaitingGS ? `Aguardando GS: ${gsDescriptionShort}` : 
                           'Disponível para Alinhar';

        const rowClass = isWaitingGS ? 'bg-red-50/50' : (isNextWaiting ? 'bg-yellow-50/50' : '');

        let moverButtons = '';
        const canMove = currentUserRole === MANAGER_ROLE && isWaiting; // SÓ PODE MOVER SE ESTIVER 'AGUARDANDO'

        // Lógica de Mover (Apenas Gerente e se estiver AGUARDANDO)
        const waitingOnlyList = activeCars.filter(c => c.status === STATUS_WAITING);
        const waitingIndex = waitingOnlyList.findIndex(c => c.id === car.id);
        const isLastWaiting = waitingIndex === waitingOnlyList.length - 1;
        const isFirstWaiting = waitingIndex === 0;

        moverButtons = `
            <div class="flex items-center justify-center space-x-1">
                <button onclick="moveAlignmentUp('${car.id}')"
                        class="text-sm p-1 rounded-full text-blue-600 hover:bg-gray-200 disabled:text-gray-300 transition"
                        ${!canMove || isFirstWaiting ? 'disabled' : ''} title="Mover para cima">
                    &#9650;
                </button>
                <button onclick="moveAlignmentDown('${car.id}')"
                        class="text-sm p-1 rounded-full text-blue-600 hover:bg-gray-200 disabled:text-gray-300 transition"
                        ${!canMove || isLastWaiting ? 'disabled' : ''} title="Mover para baixo">
                    &#9660;
                </button>
            </div>
        `;


        let actions;

        if (isAttending) {
            actions = `
                <button onclick="showAlignmentReadyConfirmation('${car.id}')"
                    class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-lg hover:bg-green-600 transition min-w-[120px]"
                    ${!isLoggedIn ? 'disabled' : ''}>
                    Pronto
                </button>
            `;
        } else if (isNextWaiting) { // Se for o PRÓXIMO disponível
            actions = `
                <button onclick="updateAlignmentStatus('${car.id}', '${STATUS_ATTENDING}')"
                    class="text-xs font-medium bg-yellow-500 text-gray-900 py-1 px-3 rounded-lg hover:bg-yellow-600 transition min-w-[120px]"
                    ${!isLoggedIn ? 'disabled' : ''}>
                    Iniciar Atendimento
                </button>
            `;
        } else {
            actions = `<span class="text-xs text-gray-400">Na fila...</span>`;
        }


        tableHTML += `
            <tr class="${rowClass}">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <span class="font-semibold">${car.carModel}</span>
                    <span class="text-xs text-gray-500 block">${car.licensePlate}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${car.customerName} (Vendedor: ${car.vendedorName || 'N/A'})</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">
                        ${statusText}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowTRap text-center text-sm font-medium">
                    ${moverButtons}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex flex-col space-y-1 sm:space-y-0 sm:space-x-2 justify-end">
                        ${actions}
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    tableContainer.innerHTML = tableHTML;
    tableContainer.prepend(emptyMessage);
    emptyMessage.style.display = 'none';
}

/**
 * Renderiza a lista unificada de trabalhos prontos para pagamento (STATUS_READY).
 */
function renderReadyJobs(serviceJobs, alignmentQueue) {
    const container = document.getElementById('ready-jobs-container');
    const emptyMessage = document.getElementById('ready-empty-message');

    // MUDANÇA: Filtra apenas por 'Ready'
    const readyServiceJobs = serviceJobs
        .filter(job => job.status === STATUS_READY)
        .map(job => ({ ...job, source: 'service', sortTimestamp: getTimestampSeconds(job.timestamp) }));
    
    const readyAlignmentJobs = alignmentQueue
        .filter(car => car.status === STATUS_READY)
        .map(car => ({ ...car, source: 'alignment', sortTimestamp: getTimestampSeconds(car.readyAt) })); // Ordena por quando ficou pronto

    const readyJobs = [...readyServiceJobs, ...readyAlignmentJobs];
    readyJobs.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    if (readyJobs.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyMessage);
        emptyMessage.style.display = 'block';
        return;
    } else {
         emptyMessage.style.display = 'none';
    }

    let tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo / Placa</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente (Vendedor)</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serviço/Mecânico</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status (Pronto)</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações (Gerente)</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
    `;

    readyJobs.forEach(job => {
        const isService = job.source === 'service';
        const serviceInfo = isService ? job.assignedMechanic : 'Alinhador';
        const serviceDetail = isService ? job.serviceDescription.substring(0, 50) + '...' : 'Revisão de Geometria/Balanceamento';
        const readyTimestamp = job.readyAt || job.timestamp; // Usa readyAt se disponível (Alinhamento)
        const readyTime = new Date(getTimestampSeconds(readyTimestamp) * 1000).toLocaleTimeString('pt-BR');


        tableHTML += `
            <tr class="ready-row">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${isService ? 'text-blue-700' : 'text-yellow-700'}">${isService ? 'Mecânica' : 'Alinhamento'}</td>
                <td class="px-6 py-4 whitespace-nowlrap text-sm font-medium text-gray-900">
                     <span class="font-semibold">${job.carModel || 'N/A'}</span>
                     <span class="text-xs text-gray-500 block">${job.licensePlate}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${job.customerName} (${job.vendedorName || 'N/A'})</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${serviceInfo} (${serviceDetail})</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-200 text-green-800">
                        PRONTO (${readyTime})
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onclick="showFinalizeConfirmation('${job.id}', '${job.source}')"
                        class="text-sm font-medium bg-red-600 text-white py-2 px-4 rounded-lg shadow-md hover:bg-red-700 transition duration-150 ease-in-out"
                        ${currentUserRole !== MANAGER_ROLE ? 'disabled' : ''}>
                        Finalizar e Receber
                    </button>
                </td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
    container.prepend(emptyMessage);
    emptyMessage.style.display = 'none';
}

// =========================================================================
// NOVO: Funções de Estatísticas Diárias
// =========================================================================

/**
 * Helper para obter o início do dia (00:00:00)
 */
function getStartOfTodayTimestamp() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(now);
}

/**
 * Helper para verificar se um timestamp (do Firestore ou Demo) é de hoje.
 */
function isTimestampFromToday(timestamp) {
    if (!timestamp) return false;
    const startOfToday = getStartOfTodayTimestamp();
    const jobTime = new Timestamp(getTimestampSeconds(timestamp), timestamp.nanoseconds || 0);
    return jobTime >= startOfToday;
}

/**
 * Calcula e renderiza as estatísticas do dia.
 */
function calculateAndRenderDailyStats() {
    // Filtra todos os finalizados de hoje
    const allFinalizedJobs = [
        ...serviceJobs.filter(j => j.status === STATUS_FINALIZED && isTimestampFromToday(j.finalizedAt)),
        ...alignmentQueue.filter(a => a.status === STATUS_FINALIZED && isTimestampFromToday(a.finalizedAt))
    ];

    // Usa um Set para contar carros únicos (pela placa)
    const uniquePlates = new Set();
    allFinalizedJobs.forEach(job => {
        if(job.licensePlate) uniquePlates.add(job.licensePlate);
    });
    const totalToday = uniquePlates.size;

    // NOVO: Conta Alinhamentos Finalizados Hoje
    const alignmentCount = alignmentQueue.filter(a => a.status === STATUS_FINALIZED && isTimestampFromToday(a.finalizedAt)).length;

    // MUDANÇA: Removido o 'stats-total' do HTML, agora é injetado.
    // document.getElementById('stats-total').textContent = totalToday;

    // Contagem por mecânico (apenas de serviceJobs finalizados hoje)
    const finalizedServiceJobs = serviceJobs.filter(j => j.status === STATUS_FINALIZED && isTimestampFromToday(j.finalizedAt));

    const mechanicStats = {};
    MECHANICS.forEach(m => mechanicStats[m] = 0);
    mechanicStats[TIRE_SHOP_MECHANIC] = 0;

    finalizedServiceJobs.forEach(job => {
        // Contabiliza para o Mecânico Geral
        if (job.assignedMechanic && MECHANICS.includes(job.assignedMechanic)) {
            mechanicStats[job.assignedMechanic]++;
        }
        // Contabiliza para o Borracheiro
        if (job.assignedTireShop === TIRE_SHOP_MECHANIC) {
             mechanicStats[TIRE_SHOP_MECHANIC]++;
        }
    });

    // Renderiza os stats
    // MUDANÇA: Container principal agora é o 'stats-container'
    const container = document.getElementById('stats-container');
    container.innerHTML = ''; // Limpa o container

    // 1. Renderiza o Total
    container.innerHTML += `
        <div class="p-4 bg-blue-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-blue-800">TOTAL FINALIZADO (HOJE)</p>
            <p class="text-3xl font-bold text-blue-900">${totalToday}</p>
        </div>`;

    // 2. NOVO: Renderiza Alinhamento
    container.innerHTML += `
        <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-gray-800">Alinhamento</p>
            <p class="text-3xl font-bold text-gray-900">${alignmentCount}</p>
        </div>`;
    
    // 3. Borracharia (Fixo)
    container.innerHTML += `
        <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-gray-800">${TIRE_SHOP_MECHANIC}</p>
            <p class="text-3xl font-bold text-gray-900">${mechanicStats[TIRE_SHOP_MECHANIC]}</p>
        </div>`;

    // 4. Mecânicos Dinâmicos
    MECHANICS.forEach(mechanic => {
        container.innerHTML += `
            <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
                <p class="text-sm font-medium text-gray-800">${mechanic}</p>
                <p class="text-3xl font-bold text-gray-900">${mechanicStats[mechanic]}</p>
            </div>`;
    });
}


/**
 * Configura os listeners de dados em tempo real.
 */
function setupRealtimeListeners() {
    if (!isAuthReady || isDemoMode) {
        console.warn("Listeners não configurados: Auth não pronta ou Modo Demo.");
        return; // Não configura listeners em Modo Demo
    }

    console.log("Configurando Listeners do Firestore...");
    
    const startOfToday = getStartOfTodayTimestamp();

    // Listener para Fila de Serviços Gerais
    // MUDANÇA: Busca todos os 'Pendentes', 'Prontos' OU 'Finalizados HOJE'
    const serviceQuery = query(
        collection(db, SERVICE_COLLECTION_PATH),
        where('status', 'in', [STATUS_PENDING, STATUS_READY, STATUS_FINALIZED])
        // O filtro de data é feito no cliente para incluir Pendentes e Prontos de qualquer dia
    );

    onSnapshot(serviceQuery, (snapshot) => {
        console.log("Recebidos dados de Serviços Gerais:", snapshot.docs.length);
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // MUDANÇA: Armazena todos os jobs (pendentes, prontos, finalizados)
        // Os finalizados de dias anteriores são filtrados aqui
        serviceJobs = jobs.filter(j => j.status !== STATUS_FINALIZED || isTimestampFromToday(j.finalizedAt)); 
        
        renderServiceQueues(serviceJobs);
        renderReadyJobs(serviceJobs, alignmentQueue);
        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue);
        calculateAndRenderDailyStats(); // NOVO
    }, (error) => {
        console.error("Erro no listener de Serviços:", error);
        alertUser("Erro de conexão (Serviços): " + error.message);
    });


    // Listener para Fila de Alinhamento
    const alignmentQuery = query(
        collection(db, ALIGNMENT_COLLECTION_PATH),
        where('status', 'in', [STATUS_WAITING, STATUS_ATTENDING, STATUS_WAITING_GS, STATUS_READY, STATUS_FINALIZED])
    );

    onSnapshot(alignmentQuery, (snapshot) => {
        console.log("Recebidos dados de Alinhamento:", snapshot.docs.length);
        const cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // MUDANÇA: Armazena todos, filtrando finalizados antigos
        alignmentQueue = cars.filter(c => c.status !== STATUS_FINALIZED || isTimestampFromToday(c.finalizedAt)); 

        renderAlignmentQueue(alignmentQueue);
        renderAlignmentMirror(alignmentQueue); 
        renderReadyJobs(serviceJobs, alignmentQueue);
        calculateAndRenderDailyStats(); // NOVO
    }, (error) => {
        console.error("Erro no listener de Alinhamento:", error);
        alertUser("Erro de conexão (Alinhamento): " + error.message);
    });
}


// ------------------------------------
// 5. Funções Globais e Inicialização
// ------------------------------------

// Expor funções para o escopo global (necessário para os 'onclick' do HTML)
window.markServiceReady = markServiceReady;      
window.updateAlignmentStatus = updateAlignmentStatus;
window.moveAlignmentUp = moveAlignmentUp;
window.moveAlignmentDown = moveAlignmentDown;
window.finalizeJob = finalizeJob;               
window.showServiceReadyConfirmation = showServiceReadyConfirmation; 
window.hideConfirmationModal = hideConfirmationModal;               
window.confirmServiceReady = confirmServiceReady;                   
window.showAlignmentReadyConfirmation = showAlignmentReadyConfirmation; 
window.confirmAlignmentReady = confirmAlignmentReady;               
window.showFinalizeConfirmation = showFinalizeConfirmation; 
window.confirmFinalizeJob = confirmFinalizeJob;

// NOVO: Expor funções do modal de definição de serviço
window.showDefineServiceModal = showDefineServiceModal;
window.hideDefineServiceModal = hideDefineServiceModal;

// Inicializa o Firebase
initializeFirebase();


// ------------------------------------
// 6. Controle de Navegação por Abas
// ------------------------------------

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        // Não permite troca de aba se for Alinhador (embora elas estejam escondidas)
        if (currentUserRole === ALIGNER_ROLE) return; 

        const tabId = button.dataset.tab;

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        button.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});