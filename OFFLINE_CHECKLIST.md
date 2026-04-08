# SolarPV Field Tool Offline Checklist

Use this checklist before each release candidate.

## 1) Service Worker Install
- Open app online once.
- Confirm service worker is registered in browser dev tools.
- Confirm cache name matches current release (`sw.js` `CACHE_NAME`).
- Confirm core assets are cached (HTML, CSS, all JS modules, jsPDF CDN files).

## 2) Offline Boot
- Disconnect network.
- Reload app from `http://localhost:<port>`.
- Verify app shell loads without blank screen.
- Verify route/navigation works for:
  - Panel Database
  - Sizing
  - Field Test
  - Fault Checker
  - Inspection
  - Yield Estimator

## 3) Offline Core Operations
- Create/update/delete panel records locally.
- Run sizing calculator and confirm results render.
- Run field test compare and copy/export buttons render (export file creation is local).
- Run fault detection and export buttons render.
- Run yield simulation and export buttons render.
- Save an inspection session locally.

## 4) Reconnect + Sync Recovery
- Reconnect network.
- Sign in to Firebase.
- Click `Sync Now`.
- Verify queue count returns to zero.
- Verify session and panel changes appear in cloud-synced state.

## 5) Delete/Tombstone Behavior
- Delete one session locally while signed in.
- Delete one panel locally while signed in.
- Sync and confirm deleted records do not reappear after refresh.

## 6) Final Smoke
- Hard refresh online.
- Confirm no console errors affecting navigation, sync, or export.
- Re-run automated tests:
  - `node --test --test-concurrency=1 --test-isolation=none tests\\pvcalc.test.js tests\\yield-model.test.js tests\\standards-calc.test.js tests\\pwa-offline-smoke.test.js`

