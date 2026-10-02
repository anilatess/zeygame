// Run after build: node scripts/verify-service-worker.mjs. Simulates SW events and Cache Storage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const dist = new URL('../dist/', import.meta.url);
const workerSource = await fs.readFile(new URL('sw.js', dist), 'utf8');
const indexHtml = await fs.readFile(new URL('index.html', dist), 'utf8');
const scope = 'https://example.test/zeygame/';
const completeUrl = `${scope}__zeygame_complete__`;
const listeners = new Map();
const cacheStore = new Map();
let skipWaitingCalls = 0;
let networkAvailable = true;

function cacheKey(input) {
  return typeof input === 'string' ? new URL(input, scope).href : input.url;
}

class MemoryCache {
  entries = new Map();
  async put(input, response) {
    this.entries.set(cacheKey(input), response.clone());
  }
  async match(input) {
    return this.entries.get(cacheKey(input))?.clone();
  }
}

const caches = {
  async open(name) {
    if (!cacheStore.has(name)) cacheStore.set(name, new MemoryCache());
    return cacheStore.get(name);
  },
  async keys() {
    return [...cacheStore.keys()];
  },
  async delete(name) {
    return cacheStore.delete(name);
  },
};

const unrelatedCache = await caches.open('other-application-cache');
await caches.open('zeygame-shell-v2');
await caches.open('zeygame-release-incomplete');
await unrelatedCache.put(`${scope}other-app-entry`, new Response('keep'));
const legacyCache = await caches.open('zeygame-shell-old-release');
await legacyCache.put(completeUrl, new Response('old-release'));
await legacyCache.put(
  `${scope}index.html`,
  new Response('<p>old release</p>', {
    headers: { 'Content-Type': 'text/html' },
  }),
);
const oldAssetUrl = `${scope}assets/previous-hash.js`;
await legacyCache.put(
  oldAssetUrl,
  new Response('old hashed bundle', {
    headers: { 'Content-Type': 'text/javascript' },
  }),
);

async function networkFetch(input) {
  if (!networkAvailable) throw new Error('offline');
  const url = typeof input === 'string' ? input : input.url;
  const parsed = new URL(url, scope);
  if (parsed.pathname === '/zeygame/' || parsed.pathname === '/zeygame/index.html') {
    return new Response(indexHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (parsed.pathname.endsWith('/missing-hash.js')) {
    return new Response('<html>not found</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (parsed.pathname.endsWith('/gone-hash.js')) {
    return new Response('missing', { status: 404 });
  }
  const relative = parsed.pathname.replace('/zeygame/', '');
  try {
    const body = await fs.readFile(new URL(relative, dist));
    const type = relative.endsWith('.js')
      ? 'text/javascript'
      : relative.endsWith('.css')
        ? 'text/css'
        : relative.endsWith('.html')
          ? 'text/html'
          : relative.endsWith('.svg')
            ? 'image/svg+xml'
            : 'application/manifest+json';
    return new Response(body, { status: 200, headers: { 'Content-Type': type } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

const workerSelf = {
  location: { origin: 'https://example.test' },
  clients: { claim: async () => {} },
  addEventListener(name, callback) {
    listeners.set(name, callback);
  },
  skipWaiting() {
    skipWaitingCalls++;
    return Promise.resolve();
  },
};
vm.runInNewContext(workerSource, {
  self: workerSelf,
  caches,
  fetch: (...args) => networkFetch(...args),
  Request,
  Response,
  URL,
  crypto: webcrypto,
});

async function runLifecycleEvent(name, extra = {}) {
  let work;
  listeners.get(name)({
    waitUntil(promise) {
      work = promise;
    },
    ...extra,
  });
  await work;
}

await runLifecycleEvent('install');
assert.equal(skipWaitingCalls, 0, 'installation leaves the worker waiting for user consent');
const namesAfterInstall = await caches.keys();
const shellName = namesAfterInstall.find(
  (name) =>
    name.startsWith('zeygame-shell-') &&
    !['zeygame-shell-old-release', 'zeygame-shell-v2'].includes(name),
);
assert.ok(shellName, 'build generated a release shell cache');
const shell = await caches.open(shellName);
assert.ok(await shell.match(completeUrl), 'shell is marked complete after all files are cached');
assert.ok(await shell.match(`${scope}index.html`));
assert.equal(await shell.match(`${scope}missing-hash.js`), undefined);

const extraHtml = '<!doctype html><script src="./assets/not-yet-deployed.js"></script>';
networkFetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (new URL(url).pathname === '/zeygame/') {
    return new Response(extraHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  return new Response('missing', { status: 404 });
};
let navigationResponse;
listeners.get('fetch')({
  request: { url: scope, method: 'GET', mode: 'navigate' },
  respondWith(promise) {
    navigationResponse = promise;
  },
});
const navigation = await navigationResponse;
assert.equal(
  await navigation.text(),
  indexHtml,
  'partial deployment falls back to complete cached HTML',
);
assert.deepEqual(
  (await caches.keys()).filter((name) => name.startsWith('zeygame-release-')),
  ['zeygame-release-incomplete'],
  'partial deployment creates no new release cache',
);

networkFetch = async () => {
  throw new Error('offline');
};
listeners.get('fetch')({
  request: { url: scope, method: 'GET', mode: 'navigate' },
  respondWith(promise) {
    navigationResponse = promise;
  },
});
const offlineNavigation = await navigationResponse;
assert.equal(offlineNavigation.status, 200, 'offline navigation uses a completed shell');
assert.equal(await offlineNavigation.text(), indexHtml);

let assetResponse;
networkFetch = async () =>
  new Response('<html>missing asset fallback</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
listeners.get('fetch')({
  request: new Request(`${scope}assets/missing-hash.js`),
  respondWith(promise) {
    assetResponse = promise;
  },
});
const missingAsset = await assetResponse;
assert.equal(missingAsset.status, 404);
assert.notEqual(missingAsset.headers.get('content-type'), 'text/html');

networkFetch = async () => {
  throw new Error('offline');
};
listeners.get('fetch')({
  request: new Request(oldAssetUrl),
  respondWith(promise) {
    assetResponse = promise;
  },
});
assert.equal(await (await assetResponse).text(), 'old hashed bundle');

await runLifecycleEvent('activate');
assert.ok(
  !(await caches.keys()).includes('zeygame-shell-v2'),
  'legacy incomplete cache is removed',
);
assert.ok(
  !(await caches.keys()).includes('zeygame-release-incomplete'),
  'partial cache is removed',
);
assert.ok(
  await caches
    .open('other-application-cache')
    .then((cache) => cache.match(`${scope}other-app-entry`)),
  'activation preserves another app cache',
);
assert.ok(
  (await caches.keys()).includes('zeygame-shell-old-release'),
  'old release cache remains for open tabs',
);

listeners.get('message')({ data: { type: 'ZEYGAME_ACTIVATE_UPDATE' } });
assert.equal(skipWaitingCalls, 1, 'worker activates only after the explicit update message');
networkFetch = async () =>
  new Response('<!doctype html><p>different release</p>', {
    headers: { 'Content-Type': 'text/html' },
  });
await assert.rejects(
  runLifecycleEvent('install'),
  /Shell version mismatch|Shell resource unavailable/,
);
assert.ok(
  !(await caches.keys()).includes(shellName),
  'failed installation removes its partial cache',
);
assert.ok(
  (await caches.keys()).includes('zeygame-shell-old-release'),
  'failed installation preserves the previous complete release',
);
networkFetch = async () => {
  throw new Error('offline');
};
await assert.rejects(runLifecycleEvent('install'), /offline/);
assert.ok(
  !(await caches.keys()).includes(shellName),
  'offline installation leaves no partial cache',
);
console.log(
  'PASS service worker: version integrity, atomic shell, network-first navigation, offline fallback, exact assets, scoped cleanup, explicit update',
);
