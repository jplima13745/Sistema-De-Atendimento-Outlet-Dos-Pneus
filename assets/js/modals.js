
import { state } from './appState.js';
import { markServiceReady, updateAlignmentStatus, finalizeJob } from './services.js';

export let currentJobToConfirm = { id: null, type: null, confirmAction: null, serviceType: null };

export function showConfirmationModal(id, type, title, message, confirmAction, serviceType = null) {
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

export function showFinalizeModal(id, type, title, message, confirmAction) {
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

export function hideConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.classList.add('hidden');
    currentJobToConfirm = { id: null, type: null, confirmAction: null, serviceType: null };
}

document.getElementById("confirm-button").addEventListener("click", () => {
    const { id, confirmAction, type, serviceType } = currentJobToConfirm;
    if (!id || !confirmAction) { hideConfirmationModal(); return; }
    if (confirmAction === "service") markServiceReady(id, serviceType);
    if (confirmAction === "alignment") updateAlignmentStatus(id, 'Done');
    if (confirmAction === "finalize") finalizeJob(id, type);
    hideConfirmationModal();
});

// Define service modal simple handlers (assumes markup exists)
export let currentJobToDefineId = null;
export function showDefineServiceModal(docId) {
    const job = state.serviceJobs.find(j => j.id === docId);
    if (!job) { alert("Serviço não encontrado"); return; }
    currentJobToDefineId = docId;
    document.getElementById('service-modal-car-info').textContent = `Carro: ${job.carModel} (${job.licensePlate})`;
    const currentDescription = job.serviceDescription === "Avaliação" ? "" : job.serviceDescription;
    document.getElementById('new-service-description').value = currentDescription;
    document.getElementById('define-service-modal').classList.remove('hidden');
    document.getElementById('new-service-description').focus();
}

export function hideDefineServiceModal() {
    document.getElementById('define-service-modal').classList.add('hidden');
    const form = document.getElementById('define-service-form');
    if (form) form.reset();
    currentJobToDefineId = null;
}
