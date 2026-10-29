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
  const addAllRequests = [];
  const deletedKeys = [];

  const cacheObj = {
    match: async req => {
      if (typeof opts.match === 'function') return opts.match(req);
      return undefined;
    },
    addAll: async assets => {
      addAllRequests.push(assets);
      addAllCalls.push(assets.map(asset => typeof asset === 'string' ? asset : asset.url));
      if (opts.rejectSecondAddAll && addAllCalls.length === 2) {
        throw new Error('CDN unavailable');
      }
      if (opts.neverResolveCDN && addAllCalls.length === 2) return new Promise(() => {});
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
      if (typeof opts.globalMatch === 'function') return opts.globalMatch(req);
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
    URL,
    console,
    setTimeout: opts.fastTimeout ? fn => { queueMicrotask(fn); return 1; } : setTimeout,
    clearTimeout: opts.fastTimeout ? () => {} : clearTimeout,
    Request: class { constructor(url,options) { this.url=url;this.cache=options.cache; } },
  });

  vm.runInContext(source, context, { filename: 'sw.js' });

  return { handlers, addAllCalls, addAllRequests, deletedKeys };
}

test('map tile requests bypass the service-worker cache and use normal HTTP caching',()=>{
  const sw=bootServiceWorker();
  for(const url of ['https://tile.openstreetmap.org/12/1/2.png','https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1/2']){
    let intercepted=false;sw.handlers.fetch({request:{method:'GET',mode:'no-cors',url},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
  }
});

test('service worker install caches local assets even if CDN caching fails', async () => {
  const sw = bootServiceWorker({ rejectSecondAddAll: true });
  let waitPromise;

  sw.handlers.install({ waitUntil: p => { waitPromise = p; } });
  await waitPromise;

  assert.equal(sw.addAllCalls.length, 2);
  assert.ok(sw.addAllCalls[0].includes('./index.html'));
  assert.ok(sw.addAllCalls[0].includes('./js/app.js'));
  assert.ok(sw.addAllCalls[0].includes('./js/hybrid.js'));
  assert.ok(sw.addAllCalls[0].includes('./js/utility-validator.js'));
  assert.ok(sw.addAllCalls[0].includes('./data/hybrid-inverters.json'));
  assert.ok(sw.addAllCalls[0].includes('./data/hybrid-batteries.json'));
});

test('service worker activate removes its old caches and preserves other apps', async () => {
  const sw = bootServiceWorker({ cacheKeys: ['a-old', 'solarpv-v8', 'legacy'] });
  let waitPromise;

  sw.handlers.activate({ waitUntil: p => { waitPromise = p; } });
  await waitPromise;

  assert.ok(!sw.deletedKeys.includes('a-old'));
  assert.ok(!sw.deletedKeys.includes('legacy'));
  assert.ok(sw.deletedKeys.includes('solarpv-v8'));
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

test('online navigation fetches the new app shell even when the previous shell is cached', async () => {
  const stale={version:'previous'}, fresh={status:200,headers:{get:()=> 'text/html'},version:'published',clone(){return this;}};
  const sw=bootServiceWorker({match:()=>stale,fetch:async(request,options)=>{assert.equal(options.cache,'no-cache');return fresh;}});
  let responsePromise;
  sw.handlers.fetch({request:{method:'GET',mode:'navigate'},respondWith:p=>{responsePromise=p;}});
  assert.equal(await responsePromise,fresh);
});

test('fetch ignores stale responses in older caches on the same origin', async () => {
  const current = { version: 'current' };
  const stale = { version: 'old' };
  const sw = bootServiceWorker({ match: () => current, globalMatch: () => stale });
  let responsePromise;
  sw.handlers.fetch({ request: { method: 'GET', mode: 'cors' }, respondWith: p => { responsePromise = p; } });
  assert.equal(await responsePromise, current);
});

test('every local script and stylesheet in the app shell is precached and exists', async () => {
  const sw = bootServiceWorker();
  let promise;
  sw.handlers.install({ waitUntil: p => { promise = p; } });
  await promise;
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js\/|css\/|icons\/)[^"]+)"/g)].map(m => './' + m[1]);
  for (const ref of refs) {
    assert.ok(sw.addAllCalls[0].includes(ref), `Missing precache asset: ${ref}`);
    assert.ok(fs.existsSync(path.resolve(process.cwd(), ref.split('?')[0])), `Missing local file: ${ref}`);
  }
});

test('an unresponsive optional CDN cannot hold a new rule cache installation forever', async () => {
  const sw=bootServiceWorker({neverResolveCDN:true,fastTimeout:true});
  let promise;
  sw.handlers.install({waitUntil:p=>{promise=p;}});
  await promise;
  assert.ok(sw.addAllCalls[0].some(url => url.startsWith('./js/directives-2026.js?v=')));
  assert.ok(sw.addAllRequests[0].every(request=>request.cache==='reload'));
});
