// assets/js/devTools.js
import { state } from './appState.js';
import { db, collection, addDoc, SERVICE_COLLECTION_PATH, ALIGNMENT_COLLECTION_PATH } from './firebaseConfig.js';
import { Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Ferramentas de desenvolvedor para auxiliar nos testes e na depuração.
 * Para usar, abra o console do navegador e chame `seedData()`.
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
 * Povoa o banco de dados com dados de teste para o dia atual.
 * ATENÇÃO: Isso adicionará dados reais ao seu Firestore.
 */
async function seedDatabase() {
    if (!confirm("Tem certeza que deseja popular o banco de dados com 15 atendimentos de teste para o dia de hoje?")) {
        console.log("Operação de povoamento cancelada.");
        return;
    }

    console.log("🚀 Iniciando o povoamento do banco de dados...");

    const vendors = state.users.filter(u => u.role === 'vendedor' || u.role === 'manager').map(u => u.username);
    if (vendors.length === 0) vendors.push("Gerente");

    const mechanics = state.MECHANICS;
    if (mechanics.length === 0) {
        console.error("❌ Povoamento falhou: Nenhum mecânico cadastrado. Adicione mecânicos na aba 'Admin' primeiro.");
        return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0); // Hoje às 8:00

    for (let i = 0; i < 15; i++) {
        const plate = `${getRandomItem(SAMPLE_PLATES).substring(0, 3)}${Math.floor(100 + Math.random() * 900)}`;
        const model = getRandomItem(SAMPLE_MODELS);
        const vendor = getRandomItem(vendors);
        const mechanic = getRandomItem(mechanics);

        const hasService = Math.random() > 0.2; // 80% de chance de ter serviço geral
        const hasTires = hasService && Math.random() > 0.5; // 50% de chance de ter pneus (se tiver serviço)
        const hasAlignment = Math.random() > 0.3; // 70% de chance de ter alinhamento

        if (!hasService && !hasAlignment) continue; // Garante que todo carro tenha pelo menos um serviço

        const startTime = getRandomFutureTimestamp(startOfDay, i * 15, i * 15 + 10);
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

        let serviceFinalizedAt = Timestamp.fromDate(lastCompletionTime);

        let serviceJobId = null;

        // Cria o Serviço Geral se necessário
        if (hasService) {
            const newJob = {
                licensePlate: plate, carModel: model, vendedorName: vendor,
                assignedMechanic: mechanic,
                assignedTireShop: hasTires ? state.TIRE_SHOP_MECHANIC : null,
                status: 'Finalizado',
                statusGS: 'Serviço Geral Concluído',
                statusTS: hasTires ? 'Serviço Pneus Concluído' : null,
                requiresAlignment: hasAlignment,
                timestamp: startTime,
                gsCompletedAt: gsCompletedAt,
                tsCompletedAt: tsCompletedAt,
                finalizedAt: serviceFinalizedAt,
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
            const alignmentFinalizedAt = getRandomFutureTimestamp(alignmentStartTime.toDate(), 15, 35);

            const newAlignment = {
                licensePlate: plate, carModel: model, vendedorName: vendor,
                status: 'Finalizado',
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

// Expor a função para o escopo global (window) para ser chamada pelo console
window.seedData = seedDatabase;