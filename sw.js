/**
 * sw.js — Service Worker (cache-first offline support)
 */

const CACHE_NAME = 'solarpv-v30';
const CACHE_PREFIX = 'solarpv-v';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/style.css?v=12',
  './css/workspace.css?v=3',
  './icons/solar-mark.svg',
  './data/pv-modules.json',
  './data/grid-inverters.json',
  './data/hybrid-inverters.json',
  './data/hybrid-batteries.json',
  './js/catalog-store.js',
  './js/db.js',
  './js/pv-calc.js',
  './js/standards-rules.js',
  './js/standards-calc.js',
  './js/sizing.js',
  './js/wire-calc.js',
  './js/hybrid.js',
  './js/utility-validator.js',
  './js/temp-correct.js',
  './js/field-test.js',
  './js/field-test.js?v=3',
  './js/fault.js',
  './js/inspection.js',
  './js/pr.js',
  './js/reports.js',
  './js/standards.js',
  './js/degradation.js',
  './js/field-analysis.js',
  './js/diagnostics.js',
  './js/inverter-perf.js',
  './js/shading.js',
  './js/yield-estimator.js?v=4',
  './js/system-designer.js',
  './js/system-designer.js?v=2',
  './js/pv-inspector.js',
  './js/fault-ai.js',
  './js/checklist.js',
  './js/checklist.js?v=2',
  './js/report-builder.js',
  './js/report-builder.js?v=2',
  './js/cable-schedule.js',
  './js/basic-calc.js',
  './js/financials.js',
  './js/roof-layout.js',
  './data/lk-costs.json',
  './js/firebase-sync.js',
  './js/app.js',
  './js/app.js?v=14',
  './js/workspace-ui.js?v=2',
];

const CDN_ASSETS = [
  'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  'https://unpkg.com/docx@8.5.0/build/index.umd.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets (must succeed)
      const local = cache.addAll(LOCAL_ASSETS);
      // Cache CDN assets (best-effort — don't fail install if offline)
      const cdn = cache.addAll(CDN_ASSETS).catch(() => {});
      return Promise.all([local, cdn]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      // Only clean up this app's old caches; other apps may share the origin.
      Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.open(CACHE_NAME).then(cache => cache.match('./index.html'));
        }
      });
    })
  );
});
