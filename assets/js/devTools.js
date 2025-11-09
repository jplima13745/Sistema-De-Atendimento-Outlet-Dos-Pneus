// assets/js/devTools.js
import { state } from './appState.js';
import { db, collection, addDoc, getDocs, writeBatch, SERVICE_COLLECTION_PATH, ALIGNMENT_COLLECTION_PATH } from './firebaseConfig.js';
import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Ferramentas de desenvolvedor para auxiliar nos testes e na depuração.
 * Para usar, abra o console do navegador e chame `seed('finalized')`, `seed('active')`, etc.
 * Ou chame `clearAllData()` para limpar os dados de teste.
 */

const SAMPLE_PLATES = ["BRA2E19", "RIO2A18", "SAO2D17", "FLN2C16", "BHZ2B15", "POA2A14", "REC2E13", "MAN2D12", "CWB2C11", "BSB2B10"];
const SAMPLE_MODELS = ["Gol", "Onix", "Strada", "HB20", "Kwid", "Mobi", "Creta", "T-Cross", "Compass", "Toro"];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Gera um timestamp aleatório dentro do dia de hoje, entre 8h e 17h.
 * @param {Date} baseTime - O momento a partir do qual o tempo aleatório é gerado.
 * @param {number} minMinutes - Duração mínima em minutos.
 * @param {number} maxMinutes - Duração máxima em minutos.
 * @returns {Timestamp}
 */
function getRandomFutureTimestamp(baseTime, minMinutes, maxMinutes) {
    const minutesToAdd = Math.random() * (maxMinutes - minMinutes) + minMinutes;
    const futureTime = new Date(baseTime.getTime() + minutesToAdd * 60000);
    return Timestamp.fromDate(futureTime);
}

/**
 * Função principal para popular o banco de dados com diferentes cenários de teste.
 * @param {'finalized' | 'active' | 'payment' | 'lost'} scenario - O cenário a ser gerado.
 */
async function seedDatabase(scenario = 'finalized') {
    const scenarios = {
        finalized: { count: 15, status: 'Finalizado', message: 'atendimentos FINALIZADOS para o dia de hoje' },
        active: { count: 10, status: 'Pendente', message: 'atendimentos ATIVOS em várias etapas' },
        payment: { count: 5, status: 'Pronto para Pagamento', message: 'atendimentos PRONTOS PARA PAGAMENTO' },
        lost: { count: 3, status: 'Perdido', message: 'atendimentos MARCADOS COMO PERDIDOS' }
    };

    const currentScenario = scenarios[scenario];
    if (!currentScenario) {
        return console.error(`Cenário "${scenario}" inválido. Use um dos seguintes: ${Object.keys(scenarios).join(', ')}`);
    }

    if (!confirm(`Tem certeza que deseja popular o banco de dados com ${currentScenario.count} ${currentScenario.message}?`)) {
        console.log("Operação de povoamento cancelada.");
        return;
    }

    const vendors = state.users.filter(u => u.role === 'vendedor' || u.role === 'manager').map(u => u.username);
    if (vendors.length === 0) vendors.push("Gerente");

    const mechanics = state.MECHANICS;
    if (mechanics.length === 0) {
        console.error("❌ Povoamento falhou: Nenhum mecânico cadastrado. Adicione mecânicos na aba 'Admin' primeiro.");
        return;
    }

    console.log(`🚀 Iniciando povoamento para o cenário: ${scenario.toUpperCase()}`);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);

    for (let i = 0; i < currentScenario.count; i++) {
        const plate = `${getRandomItem(SAMPLE_PLATES).substring(0, 3)}${Math.floor(100 + Math.random() * 900)}`;
        const model = getRandomItem(SAMPLE_MODELS);
        const vendor = getRandomItem(vendors);
        const mechanic = getRandomItem(mechanics);

        const hasService = Math.random() > 0.2; // 80% de chance de ter serviço geral
        const hasTires = hasService && Math.random() > 0.5; // 50% de chance de ter pneus (se tiver serviço)
        const hasAlignment = Math.random() > 0.3; // 70% de chance de ter alinhamento

        if (!hasService && !hasAlignment) continue; // Garante que todo carro tenha pelo menos um serviço

        const startTime = getRandomFutureTimestamp(startOfDay, i * 10, i * 10 + 5);
        let lastCompletionTime = startTime.toDate();

        let gsCompletedAt = null;
        if (hasService) {
            gsCompletedAt = getRandomFutureTimestamp(lastCompletionTime, 15, 40);
            lastCompletionTime = gsCompletedAt.toDate();
        }

        let tsCompletedAt = null;
        if (hasTires) {
            tsCompletedAt = getRandomFutureTimestamp(lastCompletionTime, 10, 25);
            lastCompletionTime = tsCompletedAt.toDate();
        }

        // Define o status principal com base no cenário
        const mainStatus = currentScenario.status;
        const isFinalized = mainStatus === 'Finalizado';

        let finalizedAt = isFinalized ? Timestamp.fromDate(lastCompletionTime) : null;

        let serviceJobId = null;

        // Cria o Serviço Geral se necessário
        if (hasService) {
            const newJob = {
                licensePlate: plate, carModel: model, vendedorName: vendor,
                assignedMechanic: mechanic,
                assignedTireShop: hasTires ? state.TIRE_SHOP_MECHANIC : null,
                status: mainStatus,
                statusGS: isFinalized ? 'Serviço Geral Concluído' : (Math.random() > 0.5 ? 'Serviço Geral Concluído' : 'Pendente'),
                statusTS: hasTires ? (isFinalized ? 'Serviço Pneus Concluído' : 'Pendente') : null,
                requiresAlignment: hasAlignment,
                timestamp: startTime,
                gsCompletedAt: gsCompletedAt,
                tsCompletedAt: tsCompletedAt,
                finalizedAt: finalizedAt,
                serviceDescription: "Serviço de teste",
                isServiceDefined: true,
                type: 'Serviço Geral',
            };
            const docRef = await addDoc(collection(db, ...SERVICE_COLLECTION_PATH), newJob);
            serviceJobId = docRef.id;
        }

        // Cria o Alinhamento se necessário
        if (hasAlignment) {
            const alignmentStartTime = hasService ? Timestamp.fromDate(lastCompletionTime) : startTime;
            const alignmentFinalizedAt = isFinalized ? getRandomFutureTimestamp(alignmentStartTime.toDate(), 15, 35) : null;

            let alignmentStatus = 'Aguardando Serviço Geral';
            if (!hasService || newJob.statusGS === 'Serviço Geral Concluído') {
                alignmentStatus = 'Aguardando';
            }
            if (mainStatus === 'Finalizado' || mainStatus === 'Pronto para Pagamento') {
                alignmentStatus = mainStatus;
            }

            const newAlignment = {
                licensePlate: plate, carModel: model, vendedorName: vendor,
                status: alignmentStatus,
                timestamp: alignmentStartTime,
                finalizedAt: alignmentFinalizedAt,
                serviceJobId: serviceJobId, // Linka com o serviço geral, se houver
                type: 'Alinhamento',
            };
            await addDoc(collection(db, ...ALIGNMENT_COLLECTION_PATH), newAlignment);
        }
    }
    console.log("✅ Povoamento do banco de dados concluído com sucesso!");
}

/**
 * Limpa TODOS os dados das coleções de serviço e alinhamento.
 * Use com extremo cuidado.
 */
async function clearAllData() {
    if (!confirm("🛑 CUIDADO! Você está prestes a DELETAR TODOS os registros de 'serviceJobs' e 'alignmentQueue'. Esta ação não pode ser desfeita. Deseja continuar?")) {
        console.log("Operação de limpeza cancelada.");
        return;
    }

    console.log("🗑️ Iniciando limpeza completa dos dados de teste...");

    const collectionsToClear = [SERVICE_COLLECTION_PATH, ALIGNMENT_COLLECTION_PATH];
    const batch = writeBatch(db);

    for (const path of collectionsToClear) {
        const snapshot = await getDocs(collection(db, ...path));
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        console.log(`- ${snapshot.size} documentos marcados para exclusão em "${path.slice(-1)}".`);
    }

    await batch.commit();
    console.log("✅ Limpeza concluída com sucesso!");
}

// Expor as funções para o escopo global (window) para serem chamadas pelo console
window.seed = seedDatabase;
window.clearAllData = clearAllData;