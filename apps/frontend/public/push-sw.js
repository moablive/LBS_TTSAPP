/**
 * Handlers de Web Push do LBSTTSAPP.
 *
 * Este arquivo NAO e o service worker: ele e carregado DENTRO do SW que o
 * vite-plugin-pwa gera, via `workbox.importScripts` (ver vite.config.ts).
 *
 * POR QUE ASSIM, e nao um sw.js proprio como nos outros tres apps
 *
 * Todo/Money/Notes escrevem o SW a mao justamente por nao terem plugin de PWA.
 * Aqui o `vite-plugin-pwa` ja registra um SW gerado pelo Workbox, e o
 * `usePwaUpdate` depende dele para acender o UpdateBanner. Registrar um segundo
 * SW no mesmo escopo faria os dois brigarem pelo controle da pagina — o
 * `importScripts` acrescenta os listeners ao SW que ja existe, sem tocar no
 * fluxo de atualizacao.
 *
 * Por ser um arquivo de `public/`, sai do build como `/push-sw.js`, sem hash no
 * nome — o `importScripts` precisa de um caminho estavel.
 */

self.addEventListener('push', (event) => {
  let data = { title: 'LBSTTSAPP', body: '', url: '/' };
  try {
    data = { ...data, ...event.data?.json() };
  } catch {
    /* payload nao-JSON — usa os defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url },
      // `tag` unica por notificacao: com tag fixa, a segunda substituiria a
      // primeira e a pessoa perderia o aviso anterior sem ter visto.
      tag: `lbsttsapp-${Date.now()}`,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      // Foca uma aba ja aberta antes de abrir outra: sem isto, cada clique
      // deixaria mais uma aba do app para tras.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
