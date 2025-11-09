// assets/js/services.js
import { state } from './appState.js';
import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  getDoc,
  SERVICE_COLLECTION_PATH,
  ALIGNMENT_COLLECTION_PATH,
  serverNow
} from './firebaseConfig.js';
import {
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  renderServiceQueues,
  renderAlignmentQueue,
  renderAlignmentMirror,
  renderReadyJobs,
  calculateAndRenderDailyStats,
  getTimestampSeconds
} from './uiRender.js';
import { MANAGER_ROLE, VENDEDOR_ROLE } from './auth.js';
import { updateRemovalList } from './removal.js';

/* ============================================================================
   🔔 UTILITÁRIOS
============================================================================ */
export function alertUser(message) {
  const serviceError = document.getElementById('service-error');
  const alignmentError = document.getElementById('alignment-error');
  if (serviceError) serviceError.textContent = message;
  if (alignmentError) alignmentError.textContent = message;
  setTimeout(() => {
    if (serviceError) serviceError.textContent = '';
    if (alignmentError) alignmentError.textContent = '';
  }, 3000);
}

function isTimestampFromToday(timestamp) {
    if (!timestamp) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const jobDate = timestamp.toDate();
    return jobDate >= startOfToday;
}

/* ============================================================================
   ⚡️ SINCRONIZAÇÃO EM TEMPO REAL
============================================================================ */
export function setupRealtimeListeners() {
  if (!db) {
    console.warn("⚠️ Firestore não inicializado, listeners não ativados.");
    return;
  }
  
  // Limpa listeners anteriores se existirem (evita múltiplos listeners)
  if (window._serviceListener) {
    window._serviceListener(); // Unsubscribe do listener anterior
  }
  if (window._alignmentListener) {
    window._alignmentListener(); // Unsubscribe do listener anterior
  }
  if (window._finalizedServiceListener) {
    window._finalizedServiceListener(); // Unsubscribe do listener anterior
  }
  if (window._finalizedAlignmentListener) {
    window._finalizedAlignmentListener(); // Unsubscribe do listener anterior
  }

  // Calcula o início do dia para filtrar finalizados no cliente
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Listener Unificado para Serviços (ativos, prontos e finalizados)
  const serviceQuery = query(
    collection(db, ...SERVICE_COLLECTION_PATH),
    where('status', 'in', ['Pendente', 'Pronto para Pagamento', 'Finalizado', 'Serviço Geral Concluído'])
  );

  window._serviceListener = onSnapshot(serviceQuery, (snapshot) => {
    const allJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const startOfTodaySeconds = Math.floor(startOfToday.getTime() / 1000);

    // Filtra os jobs no cliente, similar à lógica antiga
    state.serviceJobs = [];
    state.finalizedToday.services = [];

    allJobs.forEach(job => {
      if (job.status === 'Finalizado') {
        const finalizedSeconds = getTimestampSeconds(job.finalizedAt);
        if (finalizedSeconds >= startOfTodaySeconds) {
          state.finalizedToday.services.push(job);
        }
      } else {
        state.serviceJobs.push(job);
      }
    });

    // Renderiza tudo para garantir a sincronia da UI
    renderServiceQueues(state.serviceJobs);
    renderReadyJobs(state.serviceJobs, state.alignmentQueue);
    calculateAndRenderDailyStats();
    updateRemovalList();
  }, (error) => {
    console.error("Erro no listener de Serviços:", error);
    alertUser("Erro de conexão (Serviços): " + error.message);
  });

  // Listener Unificado para Alinhamentos (ativos, prontos e finalizados)
  const alignmentQuery = query(
    collection(db, ...ALIGNMENT_COLLECTION_PATH),
    where('status', 'in', ['Aguardando', 'Em Atendimento', 'Aguardando Serviço Geral', 'Pronto para Pagamento', 'Finalizado'])
  );

  window._alignmentListener = onSnapshot(alignmentQuery, (snapshot) => {
    const allCars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const startOfTodaySeconds = Math.floor(startOfToday.getTime() / 1000);

    // Filtra os alinhamentos no cliente
    state.alignmentQueue = [];
    state.finalizedToday.alignments = [];

    allCars.forEach(car => {
      if (car.status === 'Finalizado') {
        const finalizedSeconds = getTimestampSeconds(car.finalizedAt);
        if (finalizedSeconds >= startOfTodaySeconds) {
          state.finalizedToday.alignments.push(car);
        }
      } else {
        state.alignmentQueue.push(car);
      }
    });

    renderAlignmentQueue(state.alignmentQueue);
    renderAlignmentMirror(state.alignmentQueue);
    renderReadyJobs(state.serviceJobs, state.alignmentQueue);
    calculateAndRenderDailyStats();
    updateRemovalList();
  }, (error) => {
    console.error("Erro no listener de Alinhamentos:", error);
    alertUser("Erro de conexão (Alinhamento): " + error.message);
  });

  console.log("📡 Firestore listeners unificados ativos (serviços e alinhamentos).");
}

/* ============================================================================
   🧾 MARCAR SERVIÇO COMO PRONTO
============================================================================ */
export async function markServiceReady(docId, serviceType) { // serviceType é 'GS' ou 'TS'
  const serviceDocRef = doc(db, ...SERVICE_COLLECTION_PATH, docId);

  try {
    // 1. Busca o documento ANTES de atualizar para ter o estado completo
    const serviceDocBefore = await getDoc(serviceDocRef);
    if (!serviceDocBefore.exists()) throw new Error("Documento de Serviço não encontrado.");
    const jobBefore = serviceDocBefore.data();

    // 2. Atualiza o status do sub-serviço que foi concluído (GS ou TS).
    const dataToUpdate = {};
    if (serviceType === 'GS') {
      dataToUpdate.statusGS = 'Serviço Geral Concluído';
      dataToUpdate.gsCompletedAt = serverNow(); // NOVO: Timestamp de conclusão do GS
    }
    if (serviceType === 'TS') {
      dataToUpdate.statusTS = 'Serviço Pneus Concluído';
      dataToUpdate.tsCompletedAt = serverNow(); // NOVO: Timestamp de conclusão do TS
    }
    
    await updateDoc(serviceDocRef, dataToUpdate);

    // 3. Busca o documento ATUALIZADO diretamente do banco de dados para garantir integridade.
    const serviceDoc = await getDoc(serviceDocRef);
    if (!serviceDoc.exists()) throw new Error("Documento de Serviço não encontrado após atualização.");
    const job = serviceDoc.data();

    // 4. Verifica se AMBOS os serviços (Geral e Pneus) estão concluídos ou não eram necessários.
    // Um serviço não é necessário se statusGS ou statusTS for null (não foi atribuído)
    const isGsReady = job.statusGS === 'Serviço Geral Concluído' || job.statusGS === null || job.statusGS === undefined;
    const isTsReady = job.statusTS === 'Serviço Pneus Concluído' || job.statusTS === null || job.statusTS === undefined;
    const isGsPending = job.statusGS === 'Pendente';

    // Se o serviço geral ainda está pendente, não faz nada além de atualizar o status do pneu.
    // A UI será atualizada pelo listener.
    if (serviceType === 'TS' && isGsPending) {
      console.log(`⏳ Serviço de pneus concluído, mas aguardando GS. Nenhuma ação de fluxo necessária.`);
      return;
    }

    // Se ambos estiverem prontos (ou se o GS foi o último a ser concluído), decide o próximo passo.
    if (isGsReady && isTsReady) {
      if (job.requiresAlignment === true) {
        // Se requer alinhamento, encontra o serviço de alinhamento associado.
        const alignQuery = query(
          collection(db, ...ALIGNMENT_COLLECTION_PATH),
          where('serviceJobId', '==', docId)
        );
        const alignSnapshot = await getDocs(alignQuery);

        if (!alignSnapshot.empty) {
          const alignDocRef = alignSnapshot.docs[0].ref;
          const alignData = alignSnapshot.docs[0].data();
          
          // Atualiza o alinhamento com informações do serviço concluído
          await updateDoc(alignDocRef, { 
            status: 'Aguardando',
            gsDescription: job.serviceDescription || alignData.gsDescription,
            gsMechanic: job.assignedMechanic || alignData.gsMechanic
          });
          
          console.log(`✅ Serviço concluído e liberado para alinhamento: ${docId}`);
        } else {
          // Caso de segurança: se não encontrar o alinhamento, vai para pagamento.
          await updateDoc(serviceDocRef, { status: 'Pronto para Pagamento' });
          console.log(`⚠️ Alinhamento não encontrado, enviando para pagamento: ${docId}`);
        }
      } else {
        // Não requer alinhamento, vai direto para pagamento
        await updateDoc(serviceDocRef, { status: 'Pronto para Pagamento' });
        console.log(`✅ Serviço concluído e enviado para pagamento: ${docId}`);
      }
    }
  } catch (error) {
    console.error("Erro ao marcar serviço como pronto (Firestore):", error);
    alertUser(`Erro no Banco de Dados: ${error.message}`);
  }
}

/* ============================================================================
   💰 FINALIZAR SERVIÇO
============================================================================ */
export async function finalizeJob(docId, collectionType) {
  if (state.currentUserRole !== MANAGER_ROLE) return alertUser("Acesso negado.");

  try {
    const path = collectionType === 'service' ? SERVICE_COLLECTION_PATH : ALIGNMENT_COLLECTION_PATH;
    const docRef = doc(db, ...path, docId);
    const dataToUpdate = { status: 'Finalizado', finalizedAt: serverNow() };
    await updateDoc(docRef, dataToUpdate);

    // Se for Alinhamento, finaliza o GS associado também
    if (collectionType === 'alignment') {
      const carDoc = await getDoc(docRef);
      if (carDoc.exists() && carDoc.data().serviceJobId) {
        const serviceJobId = carDoc.data().serviceJobId;
        const serviceDocRef = doc(db, ...SERVICE_COLLECTION_PATH, serviceJobId);
        const serviceDoc = await getDoc(serviceDocRef);
        if (serviceDoc.exists() && serviceDoc.data().status !== 'Finalizado') {
          await updateDoc(serviceDocRef, dataToUpdate);
        }
      }
    }
    console.log(`💰 Job finalizado (${collectionType}):`, docId);
  } catch (err) {
    console.error('Erro ao finalizar job:', err);
    alertUser('Erro ao finalizar serviço.');
  }
}

/* ============================================================================
   🧠 LÓGICA DE ATRIBUIÇÃO AUTOMÁTICA
============================================================================ */
let lastAssignedMechanicIndex = -1;

async function getNextMechanicInRotation() {
    if (state.MECHANICS.length === 0) {
        throw new Error("Nenhum mecânico (Geral) ativo para atribuição.");
    }

    // Garante que a lista de mecânicos esteja ordenada para consistência
    const sortedMechanics = [...state.MECHANICS].sort();

    // Avança para o próximo índice, voltando ao início se chegar ao fim
    lastAssignedMechanicIndex = (lastAssignedMechanicIndex + 1) % sortedMechanics.length;

    const nextMechanic = sortedMechanics[lastAssignedMechanicIndex];

    console.log(`🤖 Atribuição automática (Round-Robin): ${nextMechanic} é o próximo da fila.`);
    return nextMechanic;
}


/* ============================================================================
   🎬 HANDLERS DE FORMULÁRIO
============================================================================ */
export function initServiceFormHandler() {
    const serviceForm = document.getElementById('service-form');
    if (!serviceForm) return;
    
    serviceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.isLoggedIn || (state.currentUserRole !== MANAGER_ROLE && state.currentUserRole !== VENDEDOR_ROLE)) {
            return alertUser("Acesso negado.");
        }

        const customerName = 'N/A'; // Campo removido da UI
        const vendedorName = document.getElementById('vendedorName').value; // Já preenchido e readonly
        const licensePlate = document.getElementById('licensePlate').value.trim().toUpperCase();
        const carModel = document.getElementById('carModel').value.trim();
        let serviceDescription = document.getElementById('serviceDescription').value.trim();
        const isServiceDefined = serviceDescription !== '';
        if (!isServiceDefined) serviceDescription = 'Avaliação';

        const mechanicSelection = document.getElementById('assignedMechanic').value;
        const willAlignRadio = document.querySelector('input[name="willAlign"]:checked');
        const willTireChangeRadio = document.querySelector('input[name="willTireChange"]:checked');
        
        if (!willAlignRadio || !willTireChangeRadio) {
            alertUser("Por favor, selecione todas as opções.");
            return;
        }
        
        const willAlign = willAlignRadio.value === 'Sim';
        const willTireChange = willTireChangeRadio.value === 'Sim';

        const errorElement = document.getElementById('service-error');
        const messageElement = document.getElementById('assignment-message');
        
        if (!errorElement || !messageElement) return;
        
        errorElement.textContent = '';
        messageElement.textContent = 'Atribuindo...';

        // Validações
        if (!licensePlate || !carModel) {
            errorElement.textContent = 'Por favor, preencha placa e modelo do veículo.';
            messageElement.textContent = '';
            return;
        }

        if (!mechanicSelection) {
            errorElement.textContent = 'Por favor, atribua um mecânico para o serviço geral.';
            messageElement.textContent = '';
            return;
        }

        try {
            let assignedMechanic;
            if (mechanicSelection === 'automatic') {
                assignedMechanic = await getNextMechanicInRotation();
            } else {
                assignedMechanic = mechanicSelection;
            }

            const newJob = {
                customerName, vendedorName, licensePlate, carModel, serviceDescription, isServiceDefined,
                assignedMechanic,
                assignedTireShop: willTireChange ? state.TIRE_SHOP_MECHANIC : null,
                status: 'Pendente',
                statusGS: 'Pendente',
                statusTS: willTireChange ? 'Pendente' : null,
                requiresAlignment: willAlign,
                timestamp: serverNow(),
                registeredBy: state.userId,
                type: 'Serviço Geral',
                finalizedAt: null
            };

            const jobRef = await addDoc(collection(db, ...SERVICE_COLLECTION_PATH), newJob);

            if (willAlign) {
                const newAlignmentCar = {
                    customerName, vendedorName, licensePlate, carModel,
                    status: 'Aguardando Serviço Geral',
                    gsDescription: newJob.serviceDescription,
                    gsMechanic: newJob.assignedMechanic,
                    timestamp: serverNow(),
                    addedBy: state.userId,
                    type: 'Alinhamento',
                    serviceJobId: jobRef.id,
                    finalizedAt: null
                };
                await addDoc(collection(db, ...ALIGNMENT_COLLECTION_PATH), newAlignmentCar);
            }

            messageElement.textContent = `✅ Serviço atribuído a ${assignedMechanic}!`;
            serviceForm.reset();
            setTimeout(() => (messageElement.textContent = ''), 5000);

        } catch (error) {
            console.error("Erro ao cadastrar serviço:", error);
            errorElement.textContent = `Erro no cadastro: ${error.message}`;
            messageElement.textContent = '';
        }
    });
}

export function initAlignmentFormHandler() {
    const alignmentForm = document.getElementById('alignment-form');
    if (!alignmentForm) return;
    
    alignmentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.isLoggedIn || (state.currentUserRole !== MANAGER_ROLE && state.currentUserRole !== VENDEDOR_ROLE)) {
            return alertUser("Acesso negado.");
        }

        const customerName = 'N/A'; // Campo removido da UI
        const vendedorName = document.getElementById('aliVendedorName').value.trim();
        const licensePlate = document.getElementById('aliLicensePlate').value.trim().toUpperCase();
        const carModel = document.getElementById('aliCarModel').value.trim();
        const errorElement = document.getElementById('alignment-error');
        
        if (!errorElement) return;
        
        errorElement.textContent = '';

        // Validações
        if (!vendedorName || !licensePlate || !carModel) {
            errorElement.textContent = 'Por favor, preencha todos os campos obrigatórios.';
            return;
        }

        try {
            const newAlignmentCar = {
                customerName, vendedorName, licensePlate, carModel,
                status: 'Aguardando',
                timestamp: serverNow(),
                addedBy: state.userId,
                type: 'Alinhamento',
                gsDescription: 'N/A (Adicionado Manualmente)',
                gsMechanic: 'N/A',
                finalizedAt: null
            };

            await addDoc(collection(db, ...ALIGNMENT_COLLECTION_PATH), newAlignmentCar);
            errorElement.textContent = '✅ Cliente adicionado à fila de alinhamento!';
            alignmentForm.reset();
            setTimeout(() => errorElement.textContent = '', 5000);

        } catch (error) {
            console.error("Erro ao adicionar à fila de alinhamento:", error);
            errorElement.textContent = `Erro: ${error.message}`;
        }
    });
}

export async function defineService(docId, newDescription) {
    if (!state.isLoggedIn) {
        alertUser("Você precisa estar logado.");
        return;
    }
    
    if (state.currentUserRole !== MANAGER_ROLE && state.currentUserRole !== VENDEDOR_ROLE) {
        alertUser("Acesso negado.");
        return;
    }
    
    if (!newDescription || !docId) {
        alertUser("Descrição inválida.");
        return;
    }

    const dataToUpdate = { serviceDescription: newDescription, isServiceDefined: true };

    try {
        const docRef = doc(db, ...SERVICE_COLLECTION_PATH, docId);
        await updateDoc(docRef, dataToUpdate);

        const alignQuery = query(collection(db, ...ALIGNMENT_COLLECTION_PATH), where('serviceJobId', '==', docId));
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
