// Service worker mínimo: permite instalar o painel como app. Sem cache, para nunca mostrar versão velha.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
