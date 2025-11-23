const CACHE_NAME = 'mecanicos-pwa-cache-v1';

// Separa os recursos locais dos externos
const localUrlsToCache = [
  '/',
  'index.html',
  'auth.html',
  'style.css',
  'script.js',
  'auth.js',
  'push.js',
  'manifest.json',
  'icons/icon01.png',
  'icons/icon02.png',
  'sounds/notify.mp3'
];

const externalUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
];

// Evento de Instalação: Salva os arquivos estáticos no cache.
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache aberto.');
        
        // 1. Cacheia os recursos locais
        const localCachePromise = cache.addAll(localUrlsToCache);

        // 2. Cacheia os recursos externos com o modo 'no-cors'
        const externalCachePromises = externalUrlsToCache.map(url => {
          const request = new Request(url, { mode: 'no-cors' });
          return fetch(request).then(response => cache.put(request, response));
        });

        // Aguarda todas as operações de cache terminarem
        return Promise.all([localCachePromise, ...externalCachePromises]);
      })
      .then(() => self.skipWaiting()) // Força o novo service worker a se tornar ativo imediatamente.
  );
});

// Evento de Ativação: Limpa caches antigos.
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Limpando cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Torna-se o controlador para todos os clientes no escopo.
});

// Evento de Fetch: Responde com os dados do cache ou busca na rede.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o recurso estiver no cache, retorna ele. Senão, busca na rede.
        return response || fetch(event.request);
      })
  );
});

// Evento de Push: Recebe a notificação do servidor e a exibe.
self.addEventListener('push', event => {
  console.log('Service Worker: Notificação push recebida.');

  let notificationData = {};
  try {
    // Tenta extrair o payload da notificação.
    // O backend envia um objeto { notification: { ... } }
    notificationData = event.data.json().notification;
  } catch (e) {
    console.error('Erro ao parsear dados da notificação:', e);
    // Fallback para uma notificação genérica se o payload falhar
    notificationData = {
      title: 'Nova Notificação',
      body: 'Você tem uma nova mensagem.',
      icon: 'icons/icon01.png'
    };
  }

  const title = notificationData.title;
  const options = {
    body: notificationData.body,
    icon: notificationData.icon, // Ícone que aparece na notificação
    badge: 'icons/icon02.png', // Ícone para a barra de status do Android
    data: notificationData.data, // Dados extras, como a URL para abrir ao clicar
    sound: 'sounds/notify.mp3',  // Caminho para o som (suporte varia)
    vibrate: [200, 100, 200],      // Vibra por 200ms, pausa 100ms, vibra 200ms
    requireInteraction: true     // Mantém a notificação na tela até que o usuário interaja
  };

  // Garante que o Service Worker não termine antes da notificação ser exibida.
  event.waitUntil(self.registration.showNotification(title, options));
});

// Evento de Clique na Notificação: Abre o PWA quando o usuário clica.
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Clique na notificação recebido.');

  // Fecha a notificação
  event.notification.close();

  // Abre a janela do aplicativo
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se uma janela do PWA já estiver aberta, foca nela.
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Se nenhuma janela estiver aberta, abre uma nova.
      if (clients.openWindow) {
        // A URL a ser aberta pode vir dos dados da notificação,
        // ou usamos a URL inicial como padrão.
        const urlToOpen = event.notification.data?.url || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});