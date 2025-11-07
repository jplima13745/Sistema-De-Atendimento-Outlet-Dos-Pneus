
import { state } from './appState.js';
import { alertUser } from './services.js';
import { renderMechanicsManagement } from './uiRender.js';

export function initMechanicsHandlers() {
    document.getElementById('add-mechanic-form').addEventListener('submit', function(e) {
        e.preventDefault();
        if (state.currentUserRole !== 'manager') return alertUser("Acesso negado. Apenas Gerentes podem adicionar mecânicos.");
        const newName = document.getElementById('newMechanicName').value.trim();
        if (newName && !state.MECHANICS.includes(newName)) {
            state.MECHANICS.push(newName);
            renderMechanicsManagement();
            document.getElementById('newMechanicName').value = '';
            alertUser(`Mecânico ${newName} adicionado com sucesso!`);
        } else if (state.MECHANICS.includes(newName)) {
            alertUser(`Mecânico ${newName} já existe.`);
        }
    });

    document.getElementById('remove-mechanic-form').addEventListener('submit', function(e) {
        e.preventDefault();
        if (state.currentUserRole !== 'manager') return alertUser("Acesso negado. Apenas Gerentes podem remover mecânicos.");
        const nameToRemove = document.getElementById('mechanicToRemove').value;
        if (nameToRemove) {
            state.MECHANICS = state.MECHANICS.filter(m => m !== nameToRemove);
            // reassign in-memory jobs if needed
            state.serviceJobs.forEach(job => {
                if (job.assignedMechanic === nameToRemove && job.status === 'Pendente') {
                    job.assignedMechanic = state.MECHANICS[0] || 'N/A';
                }
            });
            renderMechanicsManagement();
            alertUser(`Mecânico ${nameToRemove} removido.`);
        }
    });
}
