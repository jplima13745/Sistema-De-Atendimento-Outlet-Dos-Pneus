const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors()); // Permite requisições de outras origens (nosso PWA)
app.use(bodyParser.json());

// =========================================================================
// PASSO 9: GERAÇÃO DAS CHAVES VAPID (Voluntary Application Server Identification)
// =========================================================================
// ATENÇÃO: Substitua estas chaves pelas que você vai gerar no próximo passo.
const vapidKeys = {
    publicKey: 'BK6QJSF0wZwzNPkTDQLWENm-9HsYynNimRnye3F4RtSnxGWPjhxP8o9OZSpXKKzSQWvyt8GSz13HzKq7u4OV-KI',
    privateKey: 'q2mOnpLoKfFxfCl7pbpGMcKxOztws5_CoqS_vSUiSZo'
};

// ADICIONE ISTO:
console.log("========================================");
console.log("CHAVE PÚBLICA ATIVA NO BACKEND:");
console.log(vapidKeys.publicKey);
console.log("========================================");

// Configura o web-push com as chaves VAPID. O 'mailto' é um contato de emergência.
webpush.setVapidDetails(
    'mailto:seu-email@exemplo.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

console.log("Chaves VAPID configuradas (placeholders).");

// =========================================================================
// PASSO 10: ARMAZENAMENTO DAS SUBSCRIPTIONS
// =========================================================================
// Para este exemplo, vamos salvar as subscriptions em memória.
// Em um projeto real, você deve salvar isso em um banco de dados (Firestore, SQL, etc).
let subscriptions = [];

/**
 * Endpoint para o cliente (PWA) enviar sua subscription para o servidor.
 */
app.post('/save-subscription', (req, res) => {
    const subscription = req.body;
    console.log('Recebida nova subscription para salvar:', subscription.endpoint);

    // Adiciona a nova subscription ao nosso "banco de dados" em memória
    subscriptions.push(subscription);

    res.status(201).json({ message: 'Subscription salva com sucesso.' });
});

// =========================================================================
// PASSO 11: ENDPOINT PARA ENVIAR NOTIFICAÇÕES
// =========================================================================
/**
 * Endpoint para disparar o envio de uma notificação para todos os inscritos.
 */
app.post('/send-notification', (req, res) => {
    const notificationPayload = {
        notification: {
            title: req.body.title || 'Nova Notificação!',
            body: req.body.body || 'Você tem uma nova mensagem.',
            icon: 'icons/icon-192x192.png', // Ícone que aparecerá na notificação
            data: {
                url: req.body.url || '/' // URL para abrir ao clicar na notificação
            }
        }
    };

    console.log(`Enviando notificação para ${subscriptions.length} inscritos...`);

    // Envia a notificação para cada subscription salva
    const promises = subscriptions.map(sub => webpush.sendNotification(sub, JSON.stringify(notificationPayload)));

    Promise.all(promises)
        .then(() => res.status(200).json({ message: 'Notificações enviadas com sucesso.' }))
        .catch(err => {
            console.error("Erro ao enviar notificações:", err);
            res.sendStatus(500);
        });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Push rodando na porta ${PORT}`);
});