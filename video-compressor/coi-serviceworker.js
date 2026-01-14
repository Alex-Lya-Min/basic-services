if (typeof window === 'undefined') {
  const addHeaders = (response) => {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };

  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      return;
    }

    event.respondWith((async () => {
      const response = await fetch(request);
      const needHeaders = response.headers.get('Cross-Origin-Opener-Policy') === null
        || response.headers.get('Cross-Origin-Embedder-Policy') === null;
      return needHeaders ? addHeaders(response) : response;
    })());
  });
} else {
  const register = async () => {
    if (window.crossOriginIsolated || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const url = new URL('coi-serviceworker.js', window.location.href);
      const registration = await navigator.serviceWorker.register(url);
      console.log('COOP/COEP Service Worker registered', registration.scope);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (error) {
      console.error('COOP/COEP Service Worker failed to register', error);
    }
  };

  register();
}
