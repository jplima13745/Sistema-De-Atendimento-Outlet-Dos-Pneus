import { state } from './appState.js';
import { MANAGER_ROLE, VENDEDOR_ROLE, MECANICO_ROLE, ALIGNER_ROLE } from './auth.js';
import { getSortedAlignmentQueue } from './alignment.js';
import {
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


export function renderMechanicsManagement() {
    const activeMechSpan = document.getElementById('active-mechanics');
    const assignSelect = document.getElementById('assignedMechanic');

    const mechanicNames = state.MECHANICS;

    document.getElementById('mechanic-list-title').textContent = mechanicNames.join(', ');
    document.getElementById('mechanic-monitor-title').textContent = mechanicNames.join(', ');
    assignSelect.innerHTML = '<option value="automatic">-- Atribuição Automática --</option>' + mechanicNames.map(name => `<option value="${name}">${name}</option>`).join('');
}

export function renderSalespersonDropdowns() {
    const vendedorSelect = document.getElementById('vendedorName');
    const aliVendedorSelect = document.getElementById('aliVendedorName');
    if (!vendedorSelect || !aliVendedorSelect) return;

    const salespeople = state.users.filter(u => u.role === 'vendedor').map(u => u.username);
    
    // Adiciona "Gerente" como uma opção de vendedor
    const options = ['Gerente', ...salespeople];

    const optionsHTML = options.map(name => `<option value="${name}">${name}</option>`).join('');

    vendedorSelect.innerHTML = optionsHTML;
    aliVendedorSelect.innerHTML = optionsHTML;
}

// Função de priorização inteligente para ordenação (escopo global da função)
function getServicePriority(job, forTireShop = false) {
    const isGsPending = job.statusGS === 'Pendente';
    const isGsCompleted = job.statusGS === 'Serviço Geral Concluído';
    const isTsPending = job.statusTS === 'Pendente';
    const isTsCompleted = job.statusTS === 'Serviço Pneus Concluído';
    
    if (forTireShop) {
        // Para borracheiro: serviços com GS concluído (prontos para pneus) têm prioridade máxima
        if (isGsCompleted && isTsPending) {
            return 1; // Prioridade máxima - pode iniciar imediatamente
        } else if (isGsPending && isTsPending) {
            return 2; // Prioridade média - aguardando GS
        } else {
            return 3; // Outros casos
        }
    } else {
        // Para mecânicos: serviços normais (GS pendente) têm prioridade
        if (isGsPending) {
            return 1; // Prioridade máxima - pode iniciar
        } else if (isGsCompleted && isTsPending) {
            return 2; // Prioridade menor - GS já feito, só aguardando TS
        } else {
            return 3; // Outros casos
        }
    }
}

export function renderServiceQueues(jobs) {
    const mechanicsContainer = document.getElementById('mechanics-queue-display');
    const monitorContainer = document.getElementById('mechanics-monitor');
    const tireShopList = document.getElementById('tire-shop-list');
    const tireShopCount = document.getElementById('tire-shop-count');

    // CORREÇÃO: Agrupamento de jobs movido para o início da função.
    const groupedJobs = {};
    [...state.MECHANICS, state.TIRE_SHOP_MECHANIC].forEach(m => groupedJobs[m] = []); // Inclui 'Borracheiro'
    const tireShopJobs = [];

    // Ordena por prioridade primeiro, depois por timestamp
    jobs.sort((a, b) => getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp));

    jobs.forEach(job => {
        // Extrai os status para facilitar a leitura
        const isGsPending = job.statusGS === 'Pendente';
        const isTsPending = job.statusTS === 'Pendente';
        
        // REGRA DE EXIBIÇÃO CORRIGIDA:
        // 1. Fila do Mecânico Geral:
        //    - O serviço deve aparecer se o status do Serviço Geral (GS) for 'Pendente'.
        if (job.assignedMechanic && state.MECHANICS.includes(job.assignedMechanic) && isGsPending) {
             groupedJobs[job.assignedMechanic].push(job);
        }
        
        // 2. Fila do Borracheiro:
        //    - O serviço deve aparecer se o status do Serviço de Pneus (TS) for 'Pendente'.
        if (job.assignedTireShop === state.TIRE_SHOP_MECHANIC && isTsPending) {
             tireShopJobs.push(job);
        }
    }); // <- Esta é a chave de fechamento correta para o forEach

    mechanicsContainer.innerHTML = '';
    
    // Se for mecânico, chama a função de renderização específica e encerra
    if (state.currentUserRole === MECANICO_ROLE) {
        renderMechanicView(jobs, groupedJobs);
        return;
    }
    monitorContainer.innerHTML = '';
    tireShopList.innerHTML = '';

    // Ordena a fila do borracheiro por prioridade (GS concluído primeiro)
    tireShopJobs.sort((a, b) => {
        const priorityA = getServicePriority(a, true); // true = para borracheiro
        const priorityB = getServicePriority(b, true);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB; // Menor número = maior prioridade
        }
        
        // Se mesma prioridade, ordena por timestamp
        return getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp);
    });

    tireShopCount.textContent = `${tireShopJobs.length} Carros`;
    if (tireShopJobs.length > 0) {
         tireShopList.innerHTML = tireShopJobs.map(job => {
            const isGsPending = job.statusGS === 'Pendente';
            const isGsCompleted = job.statusGS === 'Serviço Geral Concluído';
            const isTsPending = job.statusTS === 'Pendente';
            
            let statusText = '';
            let statusColor = 'text-gray-500';
            
            if (isGsPending && isTsPending) {
                statusText = `(Aguardando GS: ${job.assignedMechanic})`;
                statusColor = 'text-red-500';
            } else if (isGsCompleted && isTsPending) {
                statusText = `(GS Concluído - Pronto para Pneus)`;
                statusColor = 'text-green-600';
            } else if (isGsPending && !isTsPending) {
                statusText = `(Aguardando GS: ${job.assignedMechanic})`;
                statusColor = 'text-red-500';
            }
            
            const canMarkReady = isTsPending;
            
            return `
                <li class="p-3 bg-white border-l-4 border-yellow-500 rounded-md shadow-sm flex justify-between items-center">
                    <div>
                        <p class="font-semibold text-gray-800">${job.licensePlate} (${job.carModel || 'N/A'})</p>
                        <p class="text-sm ${statusColor}">${job.serviceDescription ? job.serviceDescription.substring(0, 30) + '...' : 'Avaliação'} ${statusText}</p>
                    </div>
                    <button onclick="showServiceReadyConfirmation('${job.id}', 'TS')"
                            class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            ${!canMarkReady ? 'disabled' : ''}>
                        ${canMarkReady ? 'Pronto' : 'Aguardando'}
                    </button>
                </li>
            `;
         }).join('');
    } else {
        tireShopList.innerHTML = '<p class="text-sm text-gray-500 italic p-3 border rounded-md">Nenhum carro na fila. ✅</p>';
    }

    // VISÃO DO GERENTE/VENDEDOR: Mostra todos os painéis
    if (state.MECHANICS.length === 0) {
         mechanicsContainer.innerHTML = '<p class="text-sm text-red-600 italic p-3 border rounded-md">Nenhum mecânico geral cadastrado. Por favor, adicione mecânicos na Aba de Serviços.</p>';
    }

    state.MECHANICS.forEach(mechanic => { // Para cada mecânico geral
        let mechanicJobs = groupedJobs[mechanic] || [];
        
        // Ordena a fila do mecânico por prioridade
        mechanicJobs.sort((a, b) => {
            const priorityA = getServicePriority(a, false); // false = para mecânico
            const priorityB = getServicePriority(b, false);
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB; // Menor número = maior prioridade
            }
            
            // Se mesma prioridade, ordena por timestamp
            return getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp);
        });
        
        const jobListHTML = mechanicJobs.map(job => {
            const isGsPending = job.statusGS === 'Pendente';
            const isTsPending = job.statusTS === 'Pendente';
            const hasTs = job.statusTS !== null && job.statusTS !== undefined;
            
            let statusText = '';
            let statusColor = 'text-gray-500';
            
            // NOVA LÓGICA DE STATUS
            if (hasTs && isTsPending) {
                statusText = `(Aguardando Pneus)`;
                statusColor = 'text-orange-500'; // Laranja para indicar espera
            }
            

            const canDefineService = state.currentUserRole === MANAGER_ROLE || state.currentUserRole === VENDEDOR_ROLE;
            const isDefined = job.isServiceDefined;
            
            // LÓGICA DO BOTÃO
            const canMarkReady = isGsPending && isDefined && (!hasTs || !isTsPending);

            // LÓGICA DE STATUS VISUAL
            if (hasTs && isTsPending) {
                statusText = `(Aguardando Pneus)`;
                statusColor = 'text-orange-500'; // Laranja para indicar espera
            }

            let descriptionHTML = '';
            let clickHandler = '';
            let cursorClass = '';

            if (!isDefined) {
                descriptionHTML = '<span class="font-bold text-red-600">(Aguardando Definição de Serviço)</span>';
                if (canDefineService) {
                    clickHandler = `onclick="showDefineServiceModal('${job.id}')"`;
                    cursorClass = 'cursor-pointer hover:bg-yellow-100/50 transition duration-150';
                    descriptionHTML += '<span class="text-xs text-blue-600 block">(Clique para definir)</span>';
                }
            } else {
                const serviceDesc = job.serviceDescription ? job.serviceDescription.substring(0, 30) + '...' : 'Avaliação';
                descriptionHTML = `<p class="text-sm ${statusColor}">${serviceDesc} ${statusText}</p>`;
            }

            return `
                <li class="p-3 bg-white border-l-4 border-blue-500 rounded-md shadow-sm flex justify-between items-center ${cursorClass}" ${clickHandler}>
                    <div>
                        <p class="font-semibold text-gray-800">${job.licensePlate} (${job.carModel || 'N/A'})</p>
                        ${descriptionHTML}
                    </div>
                    <button onclick="event.stopPropagation(); showServiceReadyConfirmation('${job.id}', 'GS')"
                            class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            ${!canMarkReady ? 'disabled' : ''}>
                        ${canMarkReady ? 'Pronto' : 'Aguardando'}
                    </button>
                </li>
            `;
        }).join('');

        mechanicsContainer.innerHTML += `
            <div class="mechanic-card bg-gray-50 p-4 rounded-lg shadow-md border border-gray-100">
                <h3 class="text-xl font-bold mb-3 text-gray-800 flex justify-between items-center">
                    ${mechanic}
                    <span class="text-sm font-semibold py-1 px-3 rounded-full ${mechanicJobs.length > 1 ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'}">
                        ${mechanicJobs.length} Carros
                    </span>
                </h3>
                <ul class="space-y-2">
                    ${jobListHTML.length > 0 ? jobListHTML : '<p class="text-sm text-gray-500 italic p-3 border rounded-md">Nenhum carro na fila. ✅</p>'}
                </ul>
            </div>
        `;

        monitorContainer.innerHTML += `
            <div class="p-6 bg-white rounded-xl shadow-lg border border-gray-200 text-center">
                <h3 class="text-2xl font-bold text-gray-800 mb-2">${mechanic}</h3>
                <p class="text-6xl font-extrabold ${mechanicJobs.length > 1 ? 'text-red-600' : 'text-blue-600'}">
                    ${mechanicJobs.length}
                </p>
                <p class="text-gray-500 mt-2">Carros Pendentes (Geral)</p>
            </div>
        `;
    });

    // Garante que o monitor do borracheiro também apareça
    monitorContainer.innerHTML += `
        <div class="p-6 bg-white rounded-xl shadow-lg border border-gray-200 text-center">
            <h3 class="text-2xl font-bold text-gray-800 mb-2">${state.TIRE_SHOP_MECHANIC}</h3>
            <p class="text-6xl font-extrabold ${tireShopJobs.length > 1 ? 'text-red-600' : 'text-blue-600'}">
                ${tireShopJobs.length}
            </p>
            <p class="text-gray-500 mt-2">Carros Pendentes (Pneus)</p>
        </div>
    `;
}

/**
 * Renderiza a visão exclusiva para o mecânico logado.
 */
function renderMechanicView(jobs, groupedJobs) {
    const mechanicViewContainer = document.getElementById('mechanic-view');
    if (!mechanicViewContainer) return;

    const myName = state.userId;
    let myJobs = groupedJobs[myName] || [];
    
    // Ordena a fila do mecânico logado por prioridade
    myJobs.sort((a, b) => {
        const priorityA = getServicePriority(a, false); // false = para mecânico
        const priorityB = getServicePriority(b, false);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB; // Menor número = maior prioridade
        }
        
        // Se mesma prioridade, ordena por timestamp
        return getTimestampSeconds(a.timestamp) - getTimestampSeconds(b.timestamp);
    });

    const jobListHTML = myJobs.map(job => {
        const isGsPending = job.statusGS === 'Pendente';
        const isTsPending = job.statusTS === 'Pendente';
        const hasTs = job.statusTS !== null && job.statusTS !== undefined;
        
        let statusText = '';
        let statusColor = 'text-gray-500';
        
        if (hasTs && isTsPending) {
            statusText = `(Aguardando Pneus)`;
            statusColor = 'text-orange-500';
        }
        
        const isDefined = job.isServiceDefined;
        const canMarkReady = isGsPending && isDefined && (!hasTs || !isTsPending);
        
        const descriptionHTML = isDefined
            ? `<p class="text-sm ${statusColor}">${job.serviceDescription ? job.serviceDescription.substring(0, 30) + '...' : 'Avaliação'} ${statusText}</p>`
            : '<span class="font-bold text-red-600">(Aguardando Definição de Serviço)</span>';

        return `
            <li class="p-3 bg-white border-l-4 border-blue-500 rounded-md shadow-sm flex justify-between items-center">
                <div>
                    <p class="font-semibold text-gray-800">${job.licensePlate} (${job.carModel || 'N/A'})</p>
                    ${descriptionHTML}
                </div>
                <button onclick="event.stopPropagation(); showServiceReadyConfirmation('${job.id}', 'GS')"
                        class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-full hover:bg-green-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        ${!canMarkReady ? 'disabled' : ''}>
                    ${canMarkReady ? 'Pronto' : 'Aguardando'}
                </button>
            </li>
        `;
    }).join('');

    mechanicViewContainer.innerHTML = `
        <div class="p-4 md:p-8">
            <div class="mechanic-card bg-gray-50 p-6 rounded-lg shadow-lg border border-gray-200">
                <h2 class="text-2xl font-bold mb-4 text-gray-800 border-b pb-3 flex justify-between items-center">
                    Meus Serviços Pendentes
                    <span class="text-base font-semibold py-1 px-4 rounded-full ${myJobs.length > 1 ? 'bg-red-200 text-red-800' : 'bg-blue-200 text-blue-800'}">
                        ${myJobs.length} Carro(s)
                    </span>
                </h2>
                <ul class="space-y-3">
                    ${jobListHTML.length > 0 ? jobListHTML : '<li class="text-base text-gray-500 italic p-4 border rounded-md bg-white">Nenhum carro na sua fila. ✅</li>'}
                </ul>
            </div>
        </div>
    `;
}

export function renderAlignmentQueue(cars) {
    const tableContainer = document.getElementById('alignment-table-container');
    const emptyMessage = document.getElementById('alignment-empty-message');
    const activeCars = getSortedAlignmentQueue();

    if (activeCars.length === 0) {
        tableContainer.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        tableContainer.appendChild(emptyMessage);
        return;
    }
    emptyMessage.classList.add('hidden');

    const nextCarIndex = activeCars.findIndex(c => c.status === 'Aguardando');

    const tableHTML = `
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
                ${activeCars.map((car, index) => {
                    const isNextWaiting = (index === nextCarIndex);
                    const isWaiting = car.status === 'Aguardando';
                    const isAttending = car.status === 'Em Atendimento';
                    const isWaitingGS = car.status === 'Aguardando Serviço Geral';

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

                    const canMove = state.currentUserRole === MANAGER_ROLE && isWaiting;
                    const waitingOnlyList = activeCars.filter(c => c.status === 'Aguardando');
                    const waitingIndex = waitingOnlyList.findIndex(c => c.id === car.id);
                    const isFirstWaiting = waitingIndex === 0;
                    const isLastWaiting = waitingIndex === waitingOnlyList.length - 1;

                    const moverButtons = `
                        <div class="flex items-center justify-center space-x-1">
                            <button onclick="moveAlignmentUp('${car.id}')" class="text-sm p-1 rounded-full text-blue-600 hover:bg-gray-200 disabled:text-gray-300 transition" ${!canMove || isFirstWaiting ? 'disabled' : ''}>&#9650;</button>
                            <button onclick="moveAlignmentDown('${car.id}')" class="text-sm p-1 rounded-full text-blue-600 hover:bg-gray-200 disabled:text-gray-300 transition" ${!canMove || isLastWaiting ? 'disabled' : ''}>&#9660;</button>
                        </div>`;

                    let actions = '';
                    const canStartService = state.currentUserRole === MANAGER_ROLE || state.currentUserRole === ALIGNER_ROLE;
                    
                    if (isAttending) {
                        // Mostra botão "Pronto" apenas para quem pode finalizar
                        if (canStartService) {
                            actions = `<button onclick="showAlignmentReadyConfirmation('${car.id}')" class="text-xs font-medium bg-green-500 text-white py-1 px-3 rounded-lg hover:bg-green-600 transition min-w-[120px]">Pronto</button>`;
                        } else {
                            actions = `<span class="text-xs text-gray-400">Em atendimento...</span>`;
                        }
                    } else if (isNextWaiting && canStartService) {
                        // Mostra botão "Iniciar Atendimento" apenas para quem pode iniciar
                        actions = `<button onclick="updateAlignmentStatus('${car.id}', 'Em Atendimento')" class="text-xs font-medium bg-yellow-500 text-gray-900 py-1 px-3 rounded-lg hover:bg-yellow-600 transition min-w-[120px]">Iniciar Atendimento</button>`;
                    } else if (isNextWaiting) {
                        actions = `<span class="text-xs text-gray-400">Aguardando atendimento...</span>`;
                    } else {
                        actions = `<span class="text-xs text-gray-400">Na fila...</span>`;
                    }

                    return `
                        <tr class="${rowClass}">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                <span class="font-semibold">${car.carModel}</span>
                                <span class="text-xs text-gray-500 block">${car.licensePlate}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${car.customerName} (Vendedor: ${car.vendedorName || 'N/A'})</td>
                            <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}">${statusText}</span></td>
                            <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">${moverButtons}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">${actions}</td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    tableContainer.innerHTML = tableHTML;
}

export function renderAlignmentMirror(cars) {
    const mirrorContainer = document.getElementById('alignment-mirror');
    const activeCars = getSortedAlignmentQueue();

    if (activeCars.length === 0) {
        mirrorContainer.innerHTML = '<p class="text-sm text-gray-500 italic p-3 text-center">Fila de Alinhamento vazia. ✅</p>';
        return;
    }

    mirrorContainer.innerHTML = `
        <ul class="space-y-2">
            ${activeCars.map((car, index) => {
                const isWaitingGS = car.status === 'Aguardando Serviço Geral';
                const isAttending = car.status === 'Em Atendimento';
                const statusClass = isAttending ? 'bg-yellow-100 text-yellow-800' : isWaitingGS ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
                const gsDescriptionShort = (car.gsDescription && car.gsDescription !== "Avaliação") ? car.gsDescription.substring(0, 20) + '...' : 'Avaliação...';
                const statusText = isAttending ? 'Em Atendimento' : isWaitingGS ? `Aguardando GS (${gsDescriptionShort})` : 'Disponível';

                return `
                    <li class="p-3 bg-white rounded-md border border-gray-200 shadow-sm flex justify-between items-center text-sm">
                        <span class="font-semibold">${index + 1}. ${car.carModel} (${car.licensePlate})</span>
                        <span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">${statusText}</span>
                    </li>`;
            }).join('')}
        </ul>`;
}

export function renderReadyJobs(serviceJobs, alignmentQueue) {
    const container = document.getElementById('ready-jobs-container');
    const emptyMessage = document.getElementById('ready-empty-message');

    const readyServiceJobs = serviceJobs.filter(job => job.status === 'Pronto para Pagamento').map(job => ({ ...job, source: 'service', sortTimestamp: getTimestampSeconds(job.timestamp) }));
    const readyAlignmentJobs = alignmentQueue.filter(car => car.status === 'Pronto para Pagamento').map(car => ({ ...car, source: 'alignment', sortTimestamp: getTimestampSeconds(car.readyAt) }));

    const readyJobs = [...readyServiceJobs, ...readyAlignmentJobs];
    readyJobs.sort((a, b) => a.sortTimestamp - b.sortTimestamp);

    if (readyJobs.length === 0) {
        container.innerHTML = '';
        emptyMessage.classList.remove('hidden');
        container.appendChild(emptyMessage);
        return;
    }
    emptyMessage.classList.add('hidden');

    const tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modelo / Placa</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente (Vendedor)</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Serviço/Mecânico</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações (Gerente)</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${readyJobs.map(job => {
                    const isService = job.source === 'service';
                    const serviceInfo = isService ? job.assignedMechanic : 'Alinhador';
                    const serviceDetail = isService ? job.serviceDescription.substring(0, 50) + '...' : 'Revisão de Geometria';

                    return `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${isService ? 'text-blue-700' : 'text-yellow-700'}">${isService ? 'Mecânica' : 'Alinhamento'}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                <span class="font-semibold">${job.carModel || 'N/A'}</span>
                                <span class="text-xs text-gray-500 block">${job.licensePlate}</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${job.customerName} (${job.vendedorName || 'N/A'})</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${serviceInfo} (${serviceDetail})</td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button onclick="showFinalizeConfirmation('${job.id}', '${job.source}')" class="text-sm font-medium bg-red-600 text-white py-2 px-4 rounded-lg shadow-md hover:bg-red-700 transition" ${state.currentUserRole !== MANAGER_ROLE ? 'disabled' : ''}>
                                    Finalizar e Receber
                                </button>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    container.innerHTML = tableHTML;
}

export function calculateAndRenderDailyStats() {
    // OTIMIZAÇÃO: Usa cache de serviços finalizados hoje (já filtrados pela query)
    
    // PASSO 1 & 2 (Dashboard): Processa os dados brutos e calcula as métricas de performance
    const reportData = processDailyReportData();
    const performanceMetrics = calculatePerformanceMetrics(reportData);
    renderPerformanceMetrics(performanceMetrics); // Renderiza as métricas do Passo 2
    calculateAndRenderHighlights(reportData, performanceMetrics); // NOVO: Renderiza os destaques do Passo 3

    const finalizedServicesToday = state.finalizedToday.services || [];
    const finalizedAlignmentsToday = state.finalizedToday.alignments || [];

    // 1. Calcula o total de carros únicos (por placa) para evitar contagem dupla.
    const allFinalizedPlates = [
        ...finalizedServicesToday.map(j => j.licensePlate),
        ...finalizedAlignmentsToday.map(a => a.licensePlate)
    ];
    const uniquePlates = new Set(allFinalizedPlates.filter(Boolean));
    const totalToday = uniquePlates.size;

    // 2. Contagem específica de alinhamentos finalizados hoje.
    const alignmentCount = finalizedAlignmentsToday.length;

    // 3. Contagem de serviços por mecânico e borracheiro, apenas dos finalizados hoje.
    const mechanicStats = {};
    
    // Inicializa estatísticas para todos os mecânicos conhecidos
    if (state.MECHANICS && state.MECHANICS.length > 0) {
        state.MECHANICS.forEach(m => mechanicStats[String(m).trim()] = 0);
    }
    mechanicStats[state.TIRE_SHOP_MECHANIC] = 0;

    finalizedServicesToday.forEach(job => {
        // Conta serviço geral (GS) pelo mecânico atribuído
        if (job.assignedMechanic) {
            const mechanicName = String(job.assignedMechanic).trim();
            // Inicializa se não existir
            if (!mechanicStats.hasOwnProperty(mechanicName)) {
                mechanicStats[mechanicName] = 0;
            }
            mechanicStats[mechanicName]++;
        }
        
        // Conta serviço de pneus (TS) pelo borracheiro
        // Só conta se o serviço realmente teve troca de pneus (assignedTireShop não é null)
        if (job.assignedTireShop && String(job.assignedTireShop).trim() === state.TIRE_SHOP_MECHANIC) {
            mechanicStats[state.TIRE_SHOP_MECHANIC]++;
        }
    });

    // 4. Renderiza os resultados no HTML.
    const statsContainer = document.getElementById('stats-container');
    if (!statsContainer) return; // Proteção contra erro se elemento não existir
    
    // CORREÇÃO: Usa um Set para garantir que a lista de mecânicos seja única,
    // combinando a lista de mecânicos ativos com os que têm estatísticas, evitando duplicatas.
    const uniqueMechanics = new Set([
        ...(state.MECHANICS || []),
        ...Object.keys(mechanicStats).filter(m => m !== state.TIRE_SHOP_MECHANIC)
    ]);
    const sortedMechanics = Array.from(uniqueMechanics).sort();
    
    statsContainer.innerHTML = `
        <div class="p-4 bg-blue-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-blue-800">TOTAL FINALIZADO (HOJE)</p>
            <p class="text-3xl font-bold text-blue-900">${totalToday}</p>
        </div>
        <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-gray-800">Alinhamento</p>
            <p class="text-3xl font-bold text-gray-900">${alignmentCount}</p>
        </div>
        <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
            <p class="text-sm font-medium text-gray-800">${state.TIRE_SHOP_MECHANIC}</p>
            <p class="text-3xl font-bold text-gray-900">${mechanicStats[state.TIRE_SHOP_MECHANIC] || 0}</p>
        </div>
        ${sortedMechanics.map(mechanic => `
            <div class="p-4 bg-gray-100 rounded-lg shadow text-center">
                <p class="text-sm font-medium text-gray-800">${mechanic}</p>
                <p class="text-3xl font-bold text-gray-900">${mechanicStats[mechanic] || 0}</p>
            </div>`).join('')}
    `;
}

// =================================================================================================
// PASSO 1 & 2 (Dashboard): Processamento de Dados e Métricas
// =================================================================================================

/**
 * PASSO 1: Processa os dados brutos dos serviços finalizados para criar um relatório unificado.
 * @returns {Array} Os dados processados do relatório diário.
 */
function processDailyReportData() {
    const finalizedServices = state.finalizedToday.services || [];
    const finalizedAlignments = state.finalizedToday.alignments || [];

    const reportMap = new Map();

    // 1. Processa os serviços de mecânica/borracharia
    finalizedServices.forEach(job => {
        const startTime = job.timestamp?.toMillis() || 0;
        const endTime = job.finalizedAt?.toMillis() || 0;
        const durationMinutes = endTime > startTime ? Math.round((endTime - startTime) / 60000) : 0;

        // Calcula durações das etapas individuais
        const gsDuration = (job.gsCompletedAt?.toMillis() || endTime) - startTime;
        const tsDuration = job.tsCompletedAt ? (job.tsCompletedAt.toMillis() - (job.gsCompletedAt?.toMillis() || startTime)) : 0;

        const entry = {
            licensePlate: job.licensePlate,
            carModel: job.carModel,
            vendedorName: job.vendedorName,
            startTime: job.timestamp?.toDate(),
            endTime: job.finalizedAt?.toDate(), // Pode ser atualizado pelo alinhamento
            totalTime: durationMinutes,
            stepDurations: {
                // A duração do GS é do início até sua conclusão.
                'Serviço Geral': gsDuration > 0 ? Math.round(gsDuration / 60000) : 0,
                // A duração do TS é da conclusão do GS (ou início) até sua própria conclusão.
                'Borracharia': tsDuration > 0 ? Math.round(tsDuration / 60000) : 0,
            },
            mechanics: new Set(),
            steps: new Set(),
        };

        // Adiciona mecânico do serviço geral
        if (job.assignedMechanic) {
            entry.mechanics.add(job.assignedMechanic);
            entry.steps.add('Serviço Geral');
        }
        // Adiciona borracheiro se houve serviço de pneus
        if (job.assignedTireShop) {
            entry.mechanics.add(state.TIRE_SHOP_MECHANIC);
            entry.steps.add('Borracharia');
        }

        reportMap.set(job.licensePlate, entry);
    });

    // 2. Processa os alinhamentos e os une aos serviços existentes
    finalizedAlignments.forEach(car => {
        const existingEntry = reportMap.get(car.licensePlate);

        if (existingEntry) {
            // O carro já existe (veio de um serviço geral), então apenas adicionamos as informações de alinhamento
            existingEntry.steps.add('Alinhamento');
            existingEntry.mechanics.add('Alinhador'); // Nome fixo para o responsável pelo alinhamento

            // Calcula a duração do alinhamento
            const alignmentStartTime = car.timestamp?.toMillis() || 0;
            const alignmentEndTimeMs = car.finalizedAt?.toMillis() || 0;
            const alignmentDuration = alignmentEndTimeMs > alignmentStartTime ? Math.round((alignmentEndTimeMs - alignmentStartTime) / 60000) : 0;
            existingEntry.stepDurations['Alinhamento'] = alignmentDuration;

            // Se o alinhamento terminou depois, atualiza o tempo final e a duração total
            const alignmentEndTime = car.finalizedAt?.toDate();
            if (alignmentEndTime > existingEntry.endTime) {
                existingEntry.endTime = alignmentEndTime;
                // A duração total é a soma das etapas para maior precisão
                existingEntry.totalTime = Object.values(existingEntry.stepDurations).reduce((a, b) => a + b, 0);
            }
        } else {
            // É um alinhamento avulso, cria uma nova entrada
            const durationMs = (car.finalizedAt?.toMillis() || 0) - (car.timestamp?.toMillis() || 0);
            const durationMinutes = durationMs > 0 ? Math.round(durationMs / 60000) : 0;

            const entry = {
                licensePlate: car.licensePlate,
                carModel: car.carModel,
                vendedorName: car.vendedorName,
                startTime: car.timestamp?.toDate(),
                endTime: car.finalizedAt?.toDate(),
                totalTime: durationMinutes,
                stepDurations: {
                    'Alinhamento': durationMinutes
                },
                mechanics: new Set(['Alinhador']),
                steps: new Set(['Alinhamento']),
            };
            reportMap.set(car.licensePlate, entry);
        }
    });

    // 3. Converte o Map para um array e ordena pelos mais recentes primeiro
    state.dailyReport = Array.from(reportMap.values()).sort((a, b) => b.endTime - a.endTime);

    // 4. Chama a função de renderização da tabela de histórico (Passo 1)
    renderDailyHistoryTable(state.dailyReport);

    return state.dailyReport;
}


// =================================================================================================
// PASSO 2 & 3 (Dashboard): Cálculo de Métricas e Destaques
// =================================================================================================
/**
 * PASSO 2: Calcula as métricas de performance a partir dos dados do relatório.
 * @param {Array} reportData - Os dados processados do relatório diário.
 * @returns {Object} Um objeto contendo as métricas calculadas.
 */
function calculatePerformanceMetrics(reportData) {
    const mechanicMetrics = {};
    const stepMetrics = {
        'Serviço Geral': { totalTime: 0, carCount: 0, averageTime: 0 },
        'Borracharia': { totalTime: 0, carCount: 0, averageTime: 0 },
        'Alinhamento': { totalTime: 0, carCount: 0, averageTime: 0 },
    };

    // Inicializa métricas para todos os mecânicos conhecidos
    [...state.MECHANICS, state.TIRE_SHOP_MECHANIC, 'Alinhador'].forEach(name => {
        mechanicMetrics[name] = { totalTime: 0, carCount: 0, averageTime: 0 };
    });

    reportData.forEach(item => {
        // Calcula métricas por mecânico
        item.mechanics.forEach(mechanicName => {
            if (mechanicMetrics[mechanicName]) {
                mechanicMetrics[mechanicName].carCount += 1;
                mechanicMetrics[mechanicName].totalTime += item.totalTime; // Usando tempo total por carro para cada mecânico envolvido
            }
        });

        // Calcula métricas por etapa
        for (const stepName in item.stepDurations) {
            if (stepMetrics[stepName] && item.stepDurations[stepName] > 0) {
                stepMetrics[stepName].carCount += 1;
                stepMetrics[stepName].totalTime += item.stepDurations[stepName];
            }
        }
    });

    // Finaliza o cálculo das médias
    for (const name in mechanicMetrics) {
        const metric = mechanicMetrics[name];
        if (metric.carCount > 0) {
            metric.averageTime = Math.round(metric.totalTime / metric.carCount);
        }
    }

    for (const name in stepMetrics) {
        const metric = stepMetrics[name];
        if (metric.carCount > 0) {
            metric.averageTime = Math.round(metric.totalTime / metric.carCount);
        }
    }

    return { mechanicMetrics, stepMetrics };
}

/**
 * PASSO 3: Analisa as métricas e os dados do relatório para encontrar os destaques do dia.
 * @param {Array} reportData - Os dados processados do relatório.
 * @param {Object} performanceMetrics - As métricas de performance calculadas.
 */
function calculateAndRenderHighlights(reportData, performanceMetrics) {
    const highlights = {
        bestMechanic: null,
        worstMechanic: null,
        slowestCar: null,
        fastestCar: null,
    };

    // 1. Encontrar melhor e pior mecânico
    const workingMechanics = Object.entries(performanceMetrics.mechanicMetrics)
        .filter(([, data]) => data.carCount > 0)
        .map(([name, data]) => ({ name, ...data }));

    if (workingMechanics.length >= 2) {
        // Para o score, normalizamos os valores de tempo médio e contagem de carros.
        const maxAvgTime = Math.max(...workingMechanics.map(m => m.averageTime));
        const minAvgTime = Math.min(...workingMechanics.map(m => m.averageTime));
        const maxCarCount = Math.max(...workingMechanics.map(m => m.carCount));
        const minCarCount = Math.min(...workingMechanics.map(m => m.carCount));

        workingMechanics.forEach(mechanic => {
            // Score de tempo: menor é melhor (valor de 0 a 1)
            const timeScore = (maxAvgTime - minAvgTime) > 0 ? (maxAvgTime - mechanic.averageTime) / (maxAvgTime - minAvgTime) : 0.5;
            // Score de contagem: maior é melhor (valor de 0 a 1)
            const countScore = (maxCarCount - minCarCount) > 0 ? (mechanic.carCount - minCarCount) / (maxCarCount - minCarCount) : 0.5;
            
            // Score final: 60% peso para tempo, 40% para quantidade
            mechanic.performanceScore = (0.6 * timeScore) + (0.4 * countScore);
        });

        workingMechanics.sort((a, b) => b.performanceScore - a.performanceScore);
        highlights.bestMechanic = workingMechanics[0];
        highlights.worstMechanic = workingMechanics[workingMechanics.length - 1];
    } else if (workingMechanics.length === 1) {
        highlights.bestMechanic = workingMechanics[0]; // Se só um trabalhou, ele é o destaque
    }

    // 2. Encontrar carro mais lento e mais rápido
    if (reportData.length > 0) {
        const validReports = reportData.filter(r => r.totalTime > 0);
        if (validReports.length > 0) {
            highlights.slowestCar = validReports.reduce((max, car) => car.totalTime > max.totalTime ? car : max);
            highlights.fastestCar = validReports.reduce((min, car) => car.totalTime < min.totalTime ? car : min);

            // Encontra a etapa mais demorada do carro mais lento
            if (highlights.slowestCar) {
                const slowestStep = Object.entries(highlights.slowestCar.stepDurations)
                    .reduce((max, step) => step[1] > max[1] ? step : max, ["", 0]);
                highlights.slowestCar.slowestStepName = slowestStep[0];
            }
        }
    }

    renderHighlights(highlights);
}

/**
 * PASSO 3: Renderiza os cards de destaques do dia.
 * @param {Object} highlights - O objeto com os destaques calculados.
 */
function renderHighlights(highlights) {
    const container = document.getElementById('highlights-container');
    if (!container) return;

    let html = '';

    if (highlights.bestMechanic) {
        html += `
        <div class="p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm text-center">
            <p class="text-sm font-semibold text-green-800">🏅 MELHOR DESEMPENHO</p>
            <p class="text-2xl font-bold text-green-900 mt-1">${highlights.bestMechanic.name}</p>
            <p class="text-sm text-gray-600">${highlights.bestMechanic.averageTime} min/carro • ${highlights.bestMechanic.carCount} carro(s)</p>
        </div>`;
    }
    if (highlights.worstMechanic && highlights.bestMechanic !== highlights.worstMechanic) {
        html += `
        <div class="p-4 bg-red-50 border border-red-200 rounded-lg shadow-sm text-center">
            <p class="text-sm font-semibold text-red-800">🧱 PIOR DESEMPENHO</p>
            <p class="text-2xl font-bold text-red-900 mt-1">${highlights.worstMechanic.name}</p>
            <p class="text-sm text-gray-600">${highlights.worstMechanic.averageTime} min/carro • ${highlights.worstMechanic.carCount} carro(s)</p>
        </div>`;
    }
    if (highlights.slowestCar) {
        html += `
        <div class="p-4 bg-orange-50 border border-orange-200 rounded-lg shadow-sm text-center">
            <p class="text-sm font-semibold text-orange-800">🐢 ATENDIMENTO MAIS LENTO</p>
            <p class="text-xl font-bold text-orange-900 mt-1">${highlights.slowestCar.licensePlate} (${highlights.slowestCar.totalTime} min)</p>
            <p class="text-sm text-gray-600">Gargalo: ${highlights.slowestCar.slowestStepName || 'N/A'}</p>
        </div>`;
    }
    if (highlights.fastestCar) {
        html += `
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg shadow-sm text-center">
            <p class="text-sm font-semibold text-blue-800">⚡ ATENDIMENTO MAIS RÁPIDO</p>
            <p class="text-xl font-bold text-blue-900 mt-1">${highlights.fastestCar.licensePlate} (${highlights.fastestCar.totalTime} min)</p>
            <p class="text-sm text-gray-600">${Array.from(highlights.fastestCar.steps).join(', ')}</p>
        </div>`;
    }

    container.innerHTML = html || `<p class="col-span-full text-center text-gray-500 p-4">Aguardando mais dados para gerar destaques...</p>`;
}

/**
 * PASSO 2: Renderiza os cards de métricas de performance.
 * @param {Object} metrics - O objeto com as métricas calculadas.
 */
function renderPerformanceMetrics(metrics) {
    if (!metrics) return;
    const teamContainer = document.getElementById('team-metrics-container');
    const stepContainer = document.getElementById('step-metrics-container');
    if (!teamContainer || !stepContainer) return;

    teamContainer.innerHTML = Object.entries(metrics.mechanicMetrics)
        .filter(([, data]) => data.carCount > 0) // Mostra apenas quem trabalhou
        .map(([name, data]) => `
        <div class="p-4 bg-white rounded-lg shadow-sm border text-center">
            <p class="text-base font-semibold text-gray-800">${name}</p>
            <p class="text-3xl font-bold text-blue-600 mt-1">${data.averageTime} min</p>
            <p class="text-sm text-gray-500">Média em ${data.carCount} carro(s)</p>
        </div>`).join('');

    stepContainer.innerHTML = Object.entries(metrics.stepMetrics).map(([name, data]) => `
        <div class="p-4 bg-gray-50 rounded-lg shadow-sm border text-center">
            <p class="text-base font-semibold text-gray-700">${name}</p>
            <p class="text-3xl font-bold text-gray-800 mt-1">${data.averageTime} min</p>
            <p class="text-sm text-gray-500">Média em ${data.carCount} serviço(s)</p>
        </div>`).join('');
}

/**
 * Renderiza a tabela HTML com o histórico detalhado dos atendimentos do dia.
 * @param {Array} reportData - Os dados processados do relatório.
 */
function renderDailyHistoryTable(reportData) {
    const container = document.getElementById('daily-history-container');
    if (!container) return;

    if (reportData.length === 0) {
        container.innerHTML = `<p class="p-4 text-center text-gray-500">Nenhum atendimento finalizado hoje para exibir no histórico.</p>`;
        return;
    }

    const tableHTML = `
        <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carro (Placa)</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendedor</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsáveis</th>
                    <th class="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Etapas</th>
                    <th class="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Início</th>
                    <th class="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Término</th>
                    <th class="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Duração Total</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${reportData.map(item => {
                    const formatTime = (date) => date ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

                    return `
                        <tr>
                            <td class="px-5 py-4 whitespace-nowrap">
                                <div class="text-sm font-semibold text-gray-900">${item.carModel}</div>
                                <div class="text-sm text-gray-500">${item.licensePlate}</div>
                            </td>
                            <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-700">${item.vendedorName || 'N/A'}</td>
                            <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-700">${Array.from(item.mechanics).join(', ')}</td>
                            <td class="px-5 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div class="flex flex-wrap gap-1">
                                    ${Array.from(item.steps).map(step => `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">${step}</span>`).join('')}
                                </div>
                            </td>
                            <td class="px-5 py-4 whitespace-nowrap text-center text-sm text-gray-600">${formatTime(item.startTime)}</td>
                            <td class="px-5 py-4 whitespace-nowrap text-center text-sm text-gray-600">${formatTime(item.endTime)}</td>
                            <td class="px-5 py-4 whitespace-nowrap text-center">
                                <span class="text-sm font-bold ${item.totalTime > 45 ? 'text-red-600' : 'text-green-600'}">
                                    ${item.totalTime} min
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}


// helper
export function getTimestampSeconds(timestamp) {
    if (!timestamp) return 0;
    if (timestamp.seconds) return timestamp.seconds; // Firestore Timestamp
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis() / 1000; // SDK v9
    if (typeof timestamp === 'number') return Math.floor(timestamp / 1000); // Date.now()
    return 0;
}

export function renderUserList(users) {
    const container = document.getElementById('user-list-container');
    if (!users || users.length === 0) {
        container.innerHTML = '<p class="p-4 text-center text-gray-500">Nenhum usuário cadastrado.</p>';
        return;
    }

    const tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome de Usuário</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${users.map(user => `
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.username}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.role}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                                onclick="showDeleteUserConfirmation('${user.id}', '${user.username}')" 
                                class="text-red-600 hover:text-red-900 transition"
                                ${user.role === 'manager' ? 'disabled title="Não é possível excluir o gerente"' : ''}
                            >
                                Excluir
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

export function renderRemovalList(serviceJobs, alignmentQueue) {
    const container = document.getElementById('removal-list-container');
    if (!container) return;

    // Filtra serviços ativos e remove duplicatas por ID
    const activeServiceJobs = serviceJobs
        .filter(job => {
            // Inclui serviços que estão pendentes ou têm algum serviço pendente
            const hasPendingService = job.statusGS === 'Pendente' || job.statusTS === 'Pendente';
            const isPending = job.status === 'Pendente';
            const isServiceGeneralCompleted = job.status === 'Serviço Geral Concluído';
            return (isPending || isServiceGeneralCompleted || hasPendingService) && 
                   job.status !== 'Finalizado' && 
                   job.status !== 'Perdido';
        })
        .map(job => ({ ...job, type: 'service', sortTimestamp: getTimestampSeconds(job.timestamp) }));

    const activeAlignmentJobs = alignmentQueue
        .filter(car => ['Aguardando', 'Em Atendimento', 'Aguardando Serviço Geral'].includes(car.status))
        .map(car => ({ ...car, type: 'alignment', sortTimestamp: getTimestampSeconds(car.timestamp) }));

    // Remove duplicatas por ID antes de combinar
    const uniqueServiceJobs = [];
    const seenServiceIds = new Set();
    activeServiceJobs.forEach(job => {
        if (!seenServiceIds.has(job.id)) {
            seenServiceIds.add(job.id);
            uniqueServiceJobs.push(job);
        }
    });

    const uniqueAlignmentJobs = [];
    const seenAlignmentIds = new Set();
    activeAlignmentJobs.forEach(job => {
        if (!seenAlignmentIds.has(job.id)) {
            seenAlignmentIds.add(job.id);
            uniqueAlignmentJobs.push(job);
        }
    });

    const allActiveJobs = [...uniqueServiceJobs, ...uniqueAlignmentJobs];
    allActiveJobs.sort((a, b) => b.sortTimestamp - a.sortTimestamp); // Invertido para mostrar mais recentes primeiro

    if (allActiveJobs.length === 0) {
        container.innerHTML = '<p class="p-4 text-center text-gray-500">Nenhum serviço ativo para gerenciar.</p>';
        return;
    }

    const tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origem</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Placa / Modelo</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Atual</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsável</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                ${allActiveJobs.map(job => {
                    const isService = job.type === 'service';
                    const originText = isService ? 'Mecânica/Borracharia' : 'Alinhamento';
                    const originColor = isService ? 'text-blue-700' : 'text-yellow-700';
                    const responsible = isService ? job.assignedMechanic : (job.status === 'Em Atendimento' ? 'Alinhador' : 'Fila');

                    return `
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${originColor}">${originText}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${job.licensePlate} (${job.carModel})</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${job.status}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${responsible}</td>
                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button 
                                    onclick="showManagementModal('${job.id}', '${job.type}', '${job.licensePlate}')" 
                                    class="py-2 px-4 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 transition">
                                    Gerenciar
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = tableHTML;
}