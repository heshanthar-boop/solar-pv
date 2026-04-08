# SolarPV Field Tool - Release Notes v1.1.0
Date: 2026-04-08

## Highlights
- Added non-inspection report exports (PDF/CSV) for:
  - Field Test vs STC
  - Fault Checker
  - Yield Estimator
- Improved sync stability with queue/retry UX and updatedAt conflict handling.
- Added cloud delete behavior via tombstones for sessions and panels.
- Added regression test suite and offline smoke checks.

## Stability Pass
- Service worker cache upgraded to `solarpv-v6`.
- Cache asset list updated to include new modules.
- MPPT-related sizing checks retained and validated in tests.
- CSS utility additions for hidden states and sync badges.
- Launcher scripts included (`launch.bat`, `create_shortcut.ps1`).

## Data Integrity Pass
- Expanded HTML escaping/sanitization usage in render paths.
- Panel import validation now enforces structural and numeric sanity checks.
- Local date helper usage normalized in interactive modules.
- Panel records now carry `createdAt`/`updatedAt` metadata for deterministic merges.

## Sync Completion Pass
- Added panel cloud sync (`users/{uid}/panels/{panelId}`).
- Conflict resolution now uses `updatedAt` (newest wins).
- Added delete tombstones (`_deleted=true`, `deletedAt`, `updatedAt`) for:
  - sessions
  - panels
- Sync menu now reflects queue/retry state more clearly.

## Feature Pass
- Field Test:
  - CSV export
  - PDF export
  - resilient clipboard fallback path
- Fault Checker:
  - CSV export
  - PDF export
  - state capture for report reuse
- Yield Estimator:
  - CSV export
  - PDF export
  - persisted yield result snapshot for export flow

## QA / Regression
- Added Node `node:test` suite:
  - `tests/pvcalc.test.js`
  - `tests/yield-model.test.js`
  - `tests/standards-calc.test.js`
  - `tests/pwa-offline-smoke.test.js`
- Added helper:
  - `tests/helpers/load-browser-module.js`
- Current result in this environment: **20 passed, 0 failed** (single-process runner mode).

## Known Notes
- In sandboxed environments, default multi-process `node --test` may fail with `spawn EPERM`.
- Use single-process command for deterministic CI/sandbox execution:
  - `node --test --test-concurrency=1 --test-isolation=none ...`

