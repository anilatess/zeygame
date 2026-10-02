const CACHE_NAME = '__ZEYGAME_CACHE_NAME__';
const PRECACHE_URLS = __ZEYGAME_PRECACHE_URLS__;
const PRECACHE_HASHES = __ZEYGAME_PRECACHE_HASHES__;
const BASE_URL = '__ZEYGAME_BASE_URL__';
const CACHE_PREFIXES = ['zeygame-shell-', 'zeygame-release-'];
const BASE_PATH = new URL(BASE_URL, self.location.origin).pathname;
const INDEX_URL = new URL('index.html', new URL(BASE_URL, self.location.origin)).href;
const COMPLETE_URL = new URL('__zeygame_complete__', new URL(BASE_URL, self.location.origin)).href;

self.addEventListener('install', (event) => {
  event.waitUntil(installShell());
});

self.addEventListener('activate', (event) => {
  // Keep completed releases so documents already open can still fetch their old hashed assets.
  event.waitUntil(cleanIncompleteCaches().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ZEYGAME_ACTIVATE_UPDATE') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
  } else {
    event.respondWith(networkFirstAsset(request));
  }
});

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  try {
    const entries = await Promise.all(
      PRECACHE_URLS.map(async (url) => {
        const response = await fetch(url, { cache: 'no-cache' });
        if (!isUsableResponse(url, response)) throw new Error(`Shell resource unavailable: ${url}`);
        const bytes = await response.clone().arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (hash !== PRECACHE_HASHES[url]) throw new Error(`Shell version mismatch: ${url}`);
        return [url, response];
      }),
    );
    for (const [url, response] of entries) await cache.put(url, response);
    await cache.put(COMPLETE_URL, new Response(CACHE_NAME));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

async function cleanIncompleteCaches() {
  for (const name of await caches.keys()) {
    if (name === CACHE_NAME || !CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const cache = await caches.open(name);
    if (!(await cache.match(COMPLETE_URL))) await caches.delete(name);
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (
      response.ok &&
      isHtmlResponse(response) &&
      (await cacheCompleteNavigation(request, response))
    ) {
      return response;
    }
    const cached = await cachedNavigation(request);
    if (cached) return cached;
    if (!response.ok) return response;
  } catch {
    const cached = await cachedNavigation(request);
    if (cached) return cached;
  }
  return offlineResponse();
}

async function cacheCompleteNavigation(request, response) {
  const html = await response.clone().text();
  const assetUrls = findScriptAndStyleUrls(html, response.url || request.url);
  const assetResponses = await Promise.all(
    assetUrls.map(async (url) => {
      const asset = await fetch(url, { cache: 'no-cache' });
      if (!isUsableResponse(url, asset)) throw new Error(`Application asset unavailable: ${url}`);
      return [url, asset];
    }),
  ).catch(() => null);
  if (!assetResponses) return false;

  const cacheName = `zeygame-release-${hashText(`${html}\n${assetUrls.join('\n')}`)}`;
  const cache = await caches.open(cacheName);
  try {
    for (const [url, asset] of assetResponses) await cache.put(url, asset);
    await cache.put(request, response.clone());
    await cache.put(INDEX_URL, response.clone());
    await cache.put(COMPLETE_URL, new Response(cacheName));
    return true;
  } catch {
    await caches.delete(cacheName);
    return false;
  }
}

function findScriptAndStyleUrls(html, documentUrl) {
  const urls = new Set();
  const attributes = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(attributes)) {
    let url;
    try {
      url = new URL(match[1], documentUrl);
    } catch {
      continue;
    }
    if (
      url.origin === self.location.origin &&
      url.pathname.startsWith(BASE_PATH) &&
      /\.(?:js|css)$/i.test(url.pathname)
    ) {
      urls.add(url.href);
    }
  }
  return [...urls];
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request);
    if (response.ok && !isHtmlResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    const cached = await cachedResponse(request);
    if (cached) return cached;
    return isHtmlResponse(response) ? missingAssetResponse() : response;
  } catch {
    return (await cachedResponse(request)) ?? offlineAssetResponse();
  }
}

async function cachedNavigation(request) {
  const cached = await cachedResponse(request, true);
  if (cached) return cached;
  return cachedResponse(INDEX_URL, true);
}

async function cachedResponse(request, requireComplete = false) {
  const names = (await caches.keys()).filter((name) =>
    CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  for (const name of names.reverse()) {
    const cache = await caches.open(name);
    if (requireComplete && !(await cache.match(COMPLETE_URL))) continue;
    const response = await cache.match(request);
    if (response) return response;
  }
  return undefined;
}

function isUsableResponse(url, response) {
  if (!response.ok) return false;
  const pathname = new URL(url, self.location.origin).pathname;
  const contentType = response.headers.get('content-type') ?? '';
  if (pathname.endsWith('.html') || pathname.endsWith('/')) {
    return contentType.includes('text/html');
  }
  if (/\.js$/i.test(pathname)) return /javascript|ecmascript/i.test(contentType);
  if (/\.css$/i.test(pathname)) return contentType.includes('text/css');
  if (/\.svg$/i.test(pathname)) return contentType.includes('image/svg+xml');
  if (/\.webmanifest$/i.test(pathname)) {
    return contentType.includes('manifest+json') || contentType.includes('application/json');
  }
  return true;
}

function isHtmlResponse(response) {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function offlineResponse() {
  return new Response(
    '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ZeyGame çevrimdışı</title><body><h1>ZeyGame açılamadı</h1><p>Uygulama çevrimdışı önbelleğe alınmamış. İnternet bağlantısıyla tekrar deneyin.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function offlineAssetResponse() {
  return new Response('ZeyGame asset is not available offline.', { status: 503 });
}

function missingAssetResponse() {
  return new Response('ZeyGame asset was not found.', { status: 404 });
}
