// Chave VAPID pública do seu servidor de push.
// Esta chave é usada para "assinar" a inscrição do usuário.
const VAPID_PUBLIC_KEY = 'BK6QJSF0wZwzNPkTDQLWENm-9HsYynNimRnye3F4RtSnxGWPjhxP8o9OZSpXKKzSQWvyt8GSz13HzKq7u4OV-KI';

/**
 * 1. Registra o Service Worker.
 */
export async function initializePushNotifications() {
    // Verifica se o navegador suporta Service Workers e a API Push
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported by this browser.');
        return;
    }

    try {
        // 1. Registra o Service Worker
        // O escopo '/' significa que ele controlará todas as páginas a partir da raiz do site.
        const registration = await navigator.serviceWorker.register('service-worker.js', { scope: '/' });
        console.log('Service Worker registrado com sucesso:', registration);

        // Aguarda o service worker estar pronto e ativo.
        await navigator.serviceWorker.ready;
        console.log('Service Worker está ativo.');

        // 2. Inicia o processo de inscrição para notificações.
        await subscribeUserToPush(registration);

    } catch (error) {
        console.error('Falha ao registrar o Service Worker:', error);
    }
}

/**
 * 2. Solicita permissão e inscreve o usuário para receber notificações push.
 * @param {ServiceWorkerRegistration} registration - O registro do Service Worker.
 */
async function subscribeUserToPush(registration) {
    // Primeiro, pede permissão ao usuário.
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
        console.warn('Permissão para notificações negada.');
        return;
    }

    console.log('Permissão para notificações concedida.');

    try {
        // Converte a chave VAPID para o formato correto (Uint8Array).
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        // Inscreve o usuário usando o PushManager.
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true, // Requerido, indica que toda notificação será visível ao usuário.
            applicationServerKey: applicationServerKey
        });

        console.log('Usuário inscrito com sucesso:', subscription);

        // 3. Envia a inscrição para o nosso backend.
        await sendSubscriptionToServer(subscription);

    } catch (error) {
        console.error('Falha ao inscrever o usuário para push:', error);
    }
}

/**
 * 3. Envia o objeto de inscrição para o servidor de backend.
 * @param {PushSubscription} subscription - O objeto de inscrição gerado pelo navegador.
 */
async function sendSubscriptionToServer(subscription) {
    try {
        // ATENÇÃO: Use a URL pública fornecida pelo Cloudflare Tunnel aqui!
        const response = await fetch('https://chubby-songs-spec-awarded.trycloudflare.com/save-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(subscription),
        });

        if (!response.ok) {
            throw new Error('Falha ao salvar a inscrição no servidor.');
        }

        console.log('Inscrição salva com sucesso no servidor.');

    } catch (error) {
        console.error('Erro ao enviar inscrição para o servidor:', error);
    }
}

/**
 * Converte uma string base64 (URL-safe) para um Uint8Array.
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}