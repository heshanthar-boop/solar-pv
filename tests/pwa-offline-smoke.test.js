const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function bootServiceWorker(options) {
  const opts = options || {};
  const source = fs.readFileSync(path.resolve(process.cwd(), 'sw.js'), 'utf8');

  const handlers = {};
  const addAllCalls = [];
  const deletedKeys = [];

  const cacheObj = {
    addAll: async assets => {
      addAllCalls.push(assets);
      if (opts.rejectSecondAddAll && addAllCalls.length === 2) {
        throw new Error('CDN unavailable');
      }
    },
    put: async () => {}
  };

  const caches = {
    open: async () => cacheObj,
    keys: async () => (opts.cacheKeys || ['solarpv-old', 'solarpv-v8']),
    delete: async key => {
      deletedKeys.push(key);
      return true;
    },
    match: async req => {
      if (typeof opts.match === 'function') return opts.match(req);
      return undefined;
    }
  };

  const self = {
    addEventListener: (eventName, fn) => { handlers[eventName] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: opts.fetch || (async () => ({ status: 200, clone() { return this; } })),
    Promise,
    console,
  });

  vm.runInContext(source, context, { filename: 'sw.js' });

  return { handlers, addAllCalls, deletedKeys };
}

test('service worker install caches local assets even if CDN caching fails', async () => {
  const sw = bootServiceWorker({ rejectSecondAddAll: true });
  let waitPromise;

  sw.handlers.install({ waitUntil: p => { waitPromise = p; } });
  await waitPromise;

  assert.equal(sw.addAllCalls.length, 2);
  assert.ok(sw.addAllCalls[0].includes('./index.html'));
  assert.ok(sw.addAllCalls[0].includes('./js/app.js'));
  assert.ok(sw.addAllCalls[0].includes('./js/hybrid.js'));
});

test('service worker activate removes old caches', async () => {
  const sw = bootServiceWorker({ cacheKeys: ['a-old', 'solarpv-v8', 'legacy'] });
  let waitPromise;

  sw.handlers.activate({ waitUntil: p => { waitPromise = p; } });
  await waitPromise;

  assert.ok(sw.deletedKeys.includes('a-old'));
  assert.ok(sw.deletedKeys.includes('legacy'));
  assert.ok(!sw.deletedKeys.includes('solarpv-v8'));
});

test('fetch handler returns navigation fallback when offline', async () => {
  const offlineShell = { shell: true };
  const sw = bootServiceWorker({
    fetch: async () => { throw new Error('offline'); },
    match: req => (req === './index.html' ? offlineShell : undefined),
  });

  const request = { method: 'GET', mode: 'navigate' };
  let responsePromise;

  sw.handlers.fetch({
    request,
    respondWith: p => { responsePromise = p; },
  });

  const response = await responsePromise;
  assert.equal(response, offlineShell);
});

test('fetch handler serves cached response before network', async () => {
  const cached = { cached: true };
  let fetchCalls = 0;
  const sw = bootServiceWorker({
    fetch: async () => {
      fetchCalls += 1;
      return { status: 200, clone() { return this; } };
    },
    match: req => (req && req.method === 'GET' ? cached : undefined),
  });

  const request = { method: 'GET', mode: 'cors' };
  let responsePromise;

  sw.handlers.fetch({
    request,
    respondWith: p => { responsePromise = p; },
  });

  const response = await responsePromise;
  assert.equal(response, cached);
  assert.equal(fetchCalls, 0);
});