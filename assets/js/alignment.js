// assets/js/alignment.js
import { state } from './appState.js';
import {
  db,
  collection,
  doc,
  updateDoc,
  query,
  orderBy,
  getDocs,
  ALIGNMENT_COLLECTION_PATH
} from './firebaseConfig.js';
import { getTimestampSeconds, renderAlignmentQueue, renderAlignmentMirror, renderReadyJobs } from './uiRender.js';
import { alertUser } from './services.js';

/* ============================================================================
   ⚙️ FUNÇÕES DE ORDENAÇÃO E BUSCA
============================================================================ */
export function getSortedAlignmentQueue() {
  return [...state.alignmentQueue].sort(
    (a, b) => getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp)
  );
}

export function findAdjacentCar(currentIndex, direction) {
  const activeCars = getSortedAlignmentQueue();
  let adjacentIndex = currentIndex + direction;
  while (adjacentIndex >= 0 && adjacentIndex < activeCars.length) {
    if (activeCars[adjacentIndex].status === 'Aguardando')
      return activeCars[adjacentIndex];
    adjacentIndex += direction;
  }
  return null;
}

/* ============================================================================
   🔼 MOVER PARA CIMA NA FILA
============================================================================ */
export async function moveAlignmentUp(docId) {
  try {
    const sortedQueue = getSortedAlignmentQueue();
    const index = sortedQueue.findIndex((car) => car.id === docId);
    if (index === -1 || sortedQueue[index].status !== 'Aguardando') return;

    const carBefore = findAdjacentCar(index, -1);
    if (!carBefore) return alertUser("Este carro já está no topo da fila.");

    const newTimeMillis = getTimestampSeconds(carBefore.timestamp) * 1000 - 1000;
    const ref = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
    await updateDoc(ref, { timestamp: newTimeMillis });
    console.log(`🔼 Carro movido para cima: ${docId}`);
  } catch (err) {
    console.error("Erro ao mover para cima:", err);
    alertUser("Erro ao mover carro no Firestore.");
  }
}

/* ============================================================================
   🔽 MOVER PARA BAIXO NA FILA
============================================================================ */
export async function moveAlignmentDown(docId) {
  try {
    const sortedQueue = getSortedAlignmentQueue();
    const index = sortedQueue.findIndex((car) => car.id === docId);
    if (index === -1 || sortedQueue[index].status !== 'Aguardando') return;

    const carAfter = findAdjacentCar(index, +1);
    if (!carAfter) return alertUser("Este carro já é o último da fila.");

    const newTimeMillis = getTimestampSeconds(carAfter.timestamp) * 1000 + 1000;
    const ref = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
    await updateDoc(ref, { timestamp: newTimeMillis });
    console.log(`🔽 Carro movido para baixo: ${docId}`);
  } catch (err) {
    console.error("Erro ao mover para baixo:", err);
    alertUser("Erro ao mover carro no Firestore.");
  }
}

/* ============================================================================
   🧾 ATUALIZAR STATUS DO ALINHAMENTO
============================================================================ */
export async function updateAlignmentStatus(docId, newStatus) {
  try {
    let finalStatus = newStatus;
    if (newStatus === 'Done') finalStatus = 'Pronto para Pagamento';

    const ref = doc(db, ALIGNMENT_COLLECTION_PATH, docId);
    await updateDoc(ref, {
      status: finalStatus,
      readyAt: Date.now()
    });

    console.log(`🔧 Status atualizado: ${docId} -> ${finalStatus}`);
  } catch (err) {
    console.error("Erro ao atualizar status:", err);
    alertUser("Erro ao atualizar status do alinhamento.");
  }
}
