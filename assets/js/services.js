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
  orderBy,
  SERVICE_COLLECTION_PATH,
  ALIGNMENT_COLLECTION_PATH,
  serverNow
} from './firebaseConfig.js';
import {
  renderServiceQueues,
  renderAlignmentQueue,
  renderAlignmentMirror,
  renderReadyJobs
} from './uiRender.js';

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

/* ============================================================================
   ⚡️ SINCRONIZAÇÃO EM TEMPO REAL
============================================================================ */
export function setupRealtimeListeners() {
  if (!db) {
    console.warn("⚠️ Firestore não inicializado ainda.");
    return;
  }

  const qService = query(collection(db, ...SERVICE_COLLECTION_PATH), orderBy('timestamp', 'asc'));
  onSnapshot(qService, (snapshot) => {
    state.serviceJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderServiceQueues(state.serviceJobs);
    renderReadyJobs(state.serviceJobs, state.alignmentQueue);
  });

  const qAlign = query(collection(db, ...ALIGNMENT_COLLECTION_PATH), orderBy('timestamp', 'asc'));
  onSnapshot(qAlign, (snapshot) => {
    state.alignmentQueue = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAlignmentQueue(state.alignmentQueue);
    renderAlignmentMirror(state.alignmentQueue);
  });

  console.log("📡 Firestore listeners ativos (serviceJobs e alignmentQueue)");
}

/* ============================================================================
   🧾 MARCAR SERVIÇO COMO PRONTO
============================================================================ */
export async function markServiceReady(docId, serviceType) {
  try {
    const ref = doc(db, ...SERVICE_COLLECTION_PATH, docId);
    const updates = {};

    if (serviceType === 'GS') updates.statusGS = 'Serviço Geral Concluído';
    if (serviceType === 'TS') updates.statusTS = 'Serviço Pneus Concluído';
    updates.updatedAt = serverNow();

    await updateDoc(ref, updates);
    console.log(`✅ ${serviceType} pronto -> ${docId}`);
  } catch (err) {
    console.error('Erro ao atualizar serviço:', err);
    alertUser('Erro ao atualizar serviço no Firestore.');
  }
}

/* ============================================================================
   💰 FINALIZAR SERVIÇO
============================================================================ */
export async function finalizeJob(docId, collectionType) {
  try {
    const path = collectionType === 'service' ? SERVICE_COLLECTION_PATH : ALIGNMENT_COLLECTION_PATH;
    const ref = doc(db, ...path, docId);
    await updateDoc(ref, { status: 'Finalizado', finalizedAt: serverNow() });
    console.log(`💰 Job finalizado (${collectionType}):`, docId);
  } catch (err) {
    console.error('Erro ao finalizar job:', err);
    alertUser('Erro ao finalizar serviço.');
  }
}

/* ============================================================================
   🧠 NOVO SERVIÇO
============================================================================ */
document.getElementById('service-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.isAuthReady) return alertUser('Aguardando inicialização...');

  const customerName = document.getElementById('customerName').value.trim();
  const vendedorName = document.getElementById('vendedorName').value.trim();
  const licensePlate = document.getElementById('licensePlate').value.trim().toUpperCase();
  const carModel = document.getElementById('carModel').value.trim();
  let serviceDescription = document.getElementById('serviceDescription').value.trim();
  const isServiceDefined = serviceDescription !== '';
  if (!isServiceDefined) serviceDescription = 'Avaliação';
  const manualSelection = document.getElementById('manualMechanic').value;
  const willAlign = document.querySelector('input[name="willAlign"]:checked').value === 'Sim';
  const willTireChange = document.querySelector('input[name="willTireChange"]:checked').value === 'Sim';

  const messageElement = document.getElementById('assignment-message');
  messageElement.textContent = 'Atribuindo...';

  try {
    let assignedMechanic = manualSelection && state.MECHANICS.includes(manualSelection)
      ? manualSelection
      : state.MECHANICS[0]; // fallback seguro

    const newJob = {
      customerName,
      vendedorName,
      licensePlate,
      carModel,
      serviceDescription,
      isServiceDefined,
      assignedMechanic,
      assignedTireShop: willTireChange ? state.TIRE_SHOP_MECHANIC : null,
      status: 'Pendente',
      statusGS: 'Pendente',
      statusTS: willTireChange ? 'Pendente' : null,
      requiresAlignment: willAlign,
      timestamp: Date.now(),
      registeredBy: state.userId,
      type: 'Serviço Geral',
      finalizedAt: null
    };

    const jobRef = await addDoc(collection(db, ...SERVICE_COLLECTION_PATH), newJob);

    if (willAlign) {
      const newAlignmentCar = {
        customerName,
        vendedorName,
        licensePlate,
        carModel,
        status: 'Aguardando',
        timestamp: Date.now() + 10,
        addedBy: state.userId,
        type: 'Alinhamento',
        gsDescription: newJob.serviceDescription,
        gsMechanic: newJob.assignedMechanic,
        serviceJobId: jobRef.id,
        finalizedAt: null
      };
      await addDoc(collection(db, ...ALIGNMENT_COLLECTION_PATH), newAlignmentCar);
    }

    messageElement.textContent = `✅ Serviço atribuído a ${assignedMechanic}!`;
    document.getElementById('service-form').reset();
    setTimeout(() => (messageElement.textContent = ''), 4000);
  } catch (err) {
    console.error('Erro ao adicionar serviço:', err);
    alertUser('Erro ao adicionar serviço ao Firestore.');
  }
});
