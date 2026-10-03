export function registerServiceWorker(onUpdate: (worker: ServiceWorker) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const workerUrl = new URL('sw.js', baseUrl);
  void navigator.serviceWorker
    .register(workerUrl, { scope: baseUrl.pathname })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        onUpdate(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            registration.waiting &&
            navigator.serviceWorker.controller
          ) {
            onUpdate(registration.waiting);
          }
        });
      });
    })
    .catch(() => {
      /* Service worker is optional; the online application remains usable. */
    });
}

export function activateServiceWorkerUpdate(worker: ServiceWorker): void {
  worker.postMessage({ type: 'ZEYGAME_ACTIVATE_UPDATE' });
}
