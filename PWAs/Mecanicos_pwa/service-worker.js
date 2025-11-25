const CACHE_NAME = 'mecanico-pwa-cache'; // Subi a versão para forçar atualização

// Arquivos para salvar no celular/pc
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
  'sounds/notify.mp3' // O arquivo PRECISA estar aqui para tocar offline/background
];

const externalUrlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
];

// 1. INSTALAÇÃO
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando e baixando recursos...');
  self.skipWaiting(); // Força a atualização imediata
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cacheia externos (sem travar se falhar)
      externalUrlsToCache.forEach(url => {
        const request = new Request(url, { mode: 'no-cors' });
        fetch(request).then(response => cache.put(request, response)).catch(e => {});
      });
      // Cacheia locais (crítico)
      return cache.addAll(localUrlsToCache);
    })
  );
});

// 2. ATIVAÇÃO (Limpeza)
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativo e pronto.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. FETCH (Intercepta redes)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// 4. PUSH (Onde a mágica acontece em Background)
self.addEventListener('push', event => {
  console.log('🔔 Service Worker: Push recebido em background!');

  let data = {};
  try {
    const json = event.data.json();
    data = json.notification || json;
  } catch (e) {
    data = { title: 'Nova Atividade', body: 'Verifique o painel.' };
  }

  const options = {
    body: data.body,
    icon: 'icons/icon01.png',
    badge: 'icons/icon02.png',
    
    // --- CONFIGURAÇÕES PARA FORÇAR SOM/ATENÇÃO ---
    sound: 'sounds/notify.mp3', // Tenta tocar o som customizado (funciona bem no Desktop)
    vibrate: [500, 200, 500],   // Vibração agressiva para celular (meio segundo, pausa, meio segundo)
    tag: 'autocenter-alert',    // Agrupa notificações
    renotify: true,             // IMPORTANTE: Faz tocar som de novo mesmo se já tiver uma notificação antiga lá
    requireInteraction: true,   // A notificação não some sozinha, obriga o usuário a olhar
    silent: false,              // Garante que não é silenciosa
    
    // Ações (Botão na notificação)
    actions: [
      { action: 'open', title: '👀 Ver Agora' }
    ]
  };

  event.waitUntil(
    // 1. Mostra a notificação do sistema (Windows/Android assume aqui)
    self.registration.showNotification(data.title, options)
    .then(() => {
        // 2. Tenta avisar a aba aberta (se houver) para tocar o som via JS também
        return self.clients.matchAll({type: 'window', includeUncontrolled: true});
    })
    .then(clients => {
        if (clients && clients.length) {
            clients.forEach(client => client.postMessage({ type: 'PLAY_SOUND' }));
        }
    })
  );
});

// 5. CLIQUE NA NOTIFICAÇÃO
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se já tem aba aberta, foca nela
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow('index.html');
      }
    })
  );
});