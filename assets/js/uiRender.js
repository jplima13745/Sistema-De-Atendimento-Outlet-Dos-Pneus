
import { state } from './appState.js';
import { showServiceReadyConfirmation, showAlignmentReadyConfirmation, showFinalizeConfirmation, showDefineServiceModal } from './modals.js';

export function renderMechanicsManagement() {
    const activeMechSpan = document.getElementById('active-mechanics');
    const removeSelect = document.getElementById('mechanicToRemove');
    const manualSelect = document.getElementById('manualMechanic'); 

    const mechanicTitle = state.MECHANICS.join(', ');
    document.getElementById('mechanic-list-title').textContent = mechanicTitle;
    document.getElementById('mechanic-monitor-title').textContent = mechanicTitle;
    activeMechSpan.textContent = mechanicTitle;

    let optionsHTML = '<option value="">-- Automático --</option>';
    optionsHTML += state.MECHANICS.map(m => `<option value="${m}">${m}</option>`).join('');

    removeSelect.innerHTML = state.MECHANICS.map(m => `<option value="${m}">${m}</option>`).join('');
    manualSelect.innerHTML = optionsHTML;
}

export function renderServiceQueues(jobs) {
    const mechanicsContainer = document.getElementById('mechanics-queue-display');
    const monitorContainer = document.getElementById('mechanics-monitor');
    const tireShopList = document.getElementById('tire-shop-list');
    const tireShopCount = document.getElementById('tire-shop-count');

    mechanicsContainer.innerHTML = '';
    monitorContainer.innerHTML = '';
    tireShopList.innerHTML = '';

    const pendingJobs = jobs.filter(job => job.status === 'Pendente');

    const groupedJobs = {};
    state.MECHANICS.forEach(m => groupedJobs[m] = []);
    const tireShopJobs = [];

    pendingJobs.sort((a, b) => getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp));

    pendingJobs.forEach(job => {
        if (job.statusGS === 'Pendente' && state.MECHANICS.includes(job.assignedMechanic)) {
            groupedJobs[job.assignedMechanic].push(job);
        }
        if (job.statusTS === 'Pendente' && job.assignedTireShop === state.TIRE_SHOP_MECHANIC) {
            tireShopJobs.push(job);
        }
    });

    tireShopCount.textContent = `${tireShopJobs.length} Carros`;
    if (tireShopJobs.length > 0) {
         tireShopList.innerHTML = tireShopJobs.map(job => {
            const isGsPending = job.statusGS === 'Pendente';
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

    if (state.MECHANICS.length === 0) {
         mechanicsContainer.innerHTML = '<p class="text-sm text-red-600 italic p-3 border rounded-md">Nenhum mecânico geral cadastrado. Por favor, adicione mecânicos na Aba de Serviços.</p>';
    }

    state.MECHANICS.forEach(mechanic => {
        const jobListHTML = (groupedJobs[mechanic] || []).map(job => {
            const isTsPending = job.statusTS === 'Pendente';
            const statusText = isTsPending ? `(Aguardando Pneus)` : '';
            const statusColor = isTsPending ? 'text-red-500' : 'text-gray-500';
            const isManager = state.currentUserRole === 'manager';
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
                <div class="mechanic-card bg-gray-50 p-4 rounded-lg shadow-md border border-gray-100 ${cursorClass}" ${clickHandler}>
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-semibold text-gray-800">${job.licensePlate} - ${job.carModel}</h3>
                        <div class="text-sm text-gray-500">${job.vendedorName}</div>
                    </div>
                    <div>${descriptionHTML}</div>
                    <div class="mt-3 flex justify-between items-center">
                        <div class="text-sm text-gray-500">${job.customerName}</div>
                        <div class="flex space-x-2">
                            <button onclick="showServiceReadyConfirmation('${job.id}', 'GS')" class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition">Pronto</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const col = document.createElement('div');
        col.innerHTML = `<h3 class="text-lg font-medium mb-2">${mechanic}</h3>` + jobListHTML;
        mechanicsContainer.appendChild(col);
    });
}

export function renderAlignmentQueue(queue) {
    const container = document.getElementById('alignment-table-container');
    container.innerHTML = '';
    if (!queue || queue.length === 0) {
        document.getElementById('alignment-empty-message').classList.remove('hidden');
        return;
    } else {
        document.getElementById('alignment-empty-message').classList.add('hidden');
    }
    const table = document.createElement('div');
    table.className = 'p-4';
    queue.forEach(car => {
        const card = document.createElement('div');
        card.className = 'bg-white p-3 rounded-lg mb-2 border';
        card.innerHTML = `<div class="flex justify-between items-center"><div>${car.licensePlate} - ${car.customerName}</div><div class="text-sm">${car.status}</div></div>`;
        table.appendChild(card);
    });
    container.appendChild(table);
}

export function renderAlignmentMirror(queue) {
    const mirror = document.getElementById('alignment-mirror');
    if (!queue || queue.length === 0) {
        document.getElementById('mirror-empty-message').classList.remove('hidden');
        return;
    } else {
        document.getElementById('mirror-empty-message').classList.add('hidden');
    }
    mirror.innerHTML = '<div class="space-y-2 p-2"></div>';
    const list = mirror.querySelector('div');
    queue.forEach(car => {
        const el = document.createElement('div');
        el.className = 'p-2 bg-white rounded border';
        el.textContent = `${car.licensePlate} - ${car.customerName} (${car.status})`;
        list.appendChild(el);
    });
}

export function renderReadyJobs(serviceJobs, alignmentQueue) {
    const readyContainer = document.getElementById('ready-jobs-container');
    readyContainer.innerHTML = '';
    const ready = serviceJobs.filter(j => j.status === 'Pronto para Pagamento' || j.status === 'Finalizado');
    if (ready.length === 0) {
        document.getElementById('ready-empty-message').classList.remove('hidden');
        return;
    } else {
        document.getElementById('ready-empty-message').classList.add('hidden');
    }
    ready.forEach(job => {
        const card = document.createElement('div');
        card.className = 'p-3 bg-white border rounded mb-2';
        card.innerHTML = `<div class="flex justify-between"><div>${job.licensePlate} - ${job.customerName}</div><div>${job.status}</div></div>`;
        readyContainer.appendChild(card);
    });
}

export function calculateAndRenderDailyStats() {
    // minimal placeholder to preserve behavior
    const statsContainer = document.getElementById('stats-container');
    statsContainer.innerHTML = '<div class="p-3 bg-white border rounded">Estatísticas carregadas</div>';
}

// helper
export function getTimestampSeconds(timestamp) {
    if (!timestamp) return 0;
    if (typeof timestamp.seconds === 'number') return timestamp.seconds;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis() / 1000;
    if (typeof timestamp === 'number') return Math.floor(timestamp/1000);
    return 0;
}
