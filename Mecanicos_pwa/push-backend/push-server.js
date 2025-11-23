const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors()); // Permite requisições de outras origens (nosso PWA)
app.use(bodyParser.json());

// =========================================================================
// CONFIGURAÇÃO DO FIREBASE ADMIN
// =========================================================================
const serviceAccount = require('./serviceAccountKey.json'); // Carrega a chave

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();
console.log('✅ Conectado ao Firebase com sucesso!');

// --- Constantes do projeto ---
const APP_ID = 'local-autocenter-app';
const ALIGNMENT_COLLECTION_PATH = `artifacts/${APP_ID}/public/data/alignmentQueue`;
const STATUS_WAITING = 'Aguardando';

let isFirstRun = true; // Evita notificação na inicialização do servidor

// =========================================================================
// CONFIGURAÇÃO DAS CHAVES VAPID
// =========================================================================
const vapidKeys = {
    publicKey: 'BK6QJSF0wZwzNPkTDQLWENm-9HsYynNimRnye3F4RtSnxGWPjhxP8o9OZSpXKKzSQWvyt8GSz13HzKq7u4OV-KI',
    privateKey: 'q2mOnpLoKfFxfCl7pbpGMcKxOztws5_CoqS_vSUiSZo'
};

webpush.setVapidDetails(
    'mailto:seu-email@exemplo.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// =========================================================================
// ARMAZENAMENTO DAS SUBSCRIPTIONS
// =========================================================================
let subscriptions = [];

app.post('/save-subscription', (req, res) => {
    const subscription = req.body;
    
    const exist = subscriptions.find(sub => sub.endpoint === subscription.endpoint);

    if (!exist) {
        subscriptions.push(subscription);
        console.log('✅ Nova subscription salva:', subscription.endpoint.slice(0, 40) + '...');
    } else {
        console.log('🔄 Subscription já existente. Ignorando duplicata.');
    }

    console.log(`Total de inscritos ativos: ${subscriptions.length}`);
    res.status(201).json({ message: 'Subscription processada com sucesso.' });
});

// =========================================================================
// ENDPOINT PARA ENVIAR NOTIFICAÇÕES (COM LIMPEZA AUTOMÁTICA)
// =========================================================================
app.post('/send-notification', (req, res) => {
    const notificationPayload = {
        notification: {
            title: req.body.title || 'Nova Notificação!',
            body: req.body.body || 'Você tem uma nova mensagem.',
            icon: 'icons/icon-192x192.png',
            data: { url: req.body.url || '/' }
        }
    };

    console.log(`Enviando notificação manual para ${subscriptions.length} inscritos...`);

    const promises = subscriptions.map(sub => {
        return webpush.sendNotification(sub, JSON.stringify(notificationPayload))
            .then(() => ({ success: true }))
            .catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`🧹 Removendo inscrição inativa: ${sub.endpoint}`);
                    return { success: false, deleteEndpoint: sub.endpoint };
                }
                console.error("Erro de envio:", err.statusCode);
                return { success: false };
            });
    });

    Promise.all(promises)
        .then(results => {
            const deletedEndpoints = results.filter(r => r.deleteEndpoint).map(r => r.deleteEndpoint);
            if (deletedEndpoints.length > 0) {
                subscriptions = subscriptions.filter(sub => !deletedEndpoints.includes(sub.endpoint));
                console.log(`Total de ${deletedEndpoints.length} inscrições fantasmas removidas.`);
                console.log(`Restam ${subscriptions.length} inscritos ativos.`);
            }
            res.status(200).json({ message: 'Processo de envio concluído.' });
        })
        .catch(err => {
            console.error("Erro geral no envio:", err);
            res.sendStatus(500);
        });
});

// =========================================================================
// LÓGICA DE NEGÓCIO PARA DISPARAR NOTIFICAÇÕES AUTOMÁTICAS
// =========================================================================
function sendAlignmentNotification(carData) {
    const notificationPayload = {
        notification: {
            title: 'Novo Carro na Fila!',
            body: `O carro ${carData.carModel} (Placa: ${carData.licensePlate}) está aguardando alinhamento.`,
            icon: 'icons/icon-192x192.png',
            data: { url: '/' }
        }
    };

    console.log(`📢 Disparando notificação automática para ${subscriptions.length} inscritos...`);

    const promises = subscriptions.map(sub => 
        webpush.sendNotification(sub, JSON.stringify(notificationPayload))
            .catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`🧹 Removendo inscrição inativa: ${sub.endpoint}`);
                    subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
                }
            })
    );

    Promise.all(promises).then(() => console.log('🚀 Processo de envio de notificações automáticas concluído.'));
}

// Ouve por alterações na coleção da fila de alinhamento
db.collection(ALIGNMENT_COLLECTION_PATH).onSnapshot(snapshot => {
    if (isFirstRun) {
        isFirstRun = false;
        return;
    }

    snapshot.docChanges().forEach(change => {
        const carData = change.doc.data();
        if ((change.type === 'added' || change.type === 'modified') && carData.status === STATUS_WAITING) {
            console.log(`🚗 Carro [${carData.licensePlate}] entrou na fila de alinhamento (Status: ${change.type}).`);
            sendAlignmentNotification(carData);
        }
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de push rodando na porta ${PORT}`);
});