/**
 * firebase-sync.js - Google Sign-In + Firestore sync for SolarPV Field Tool.
 * Compat SDK (plain script tags, no modules).
 *
 * Data paths:
 * - users/{uid}/sessions/{sessionId}
 * - users/{uid}/panels/{panelId}
 * - users/{uid}/meta/settings
 *
 * Conflict strategy:
 * - Record-level updatedAt comparison (remote vs local).
 * - Highest updatedAt wins.
 * - Tombstones (_deleted=true) remove local records when newer.
 */

const FirebaseSync = (() => {
  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyBlkxXy72Bj9tpH62MQiBo8eqZaynZSfXA",
    authDomain:        "solarpv-field-tool.firebaseapp.com",
    projectId:         "solarpv-field-tool",
    storageBucket:     "solarpv-field-tool.firebasestorage.app",
    messagingSenderId: "956132048124",
    appId:             "1:956132048124:web:a075541517ec3ceb152b79"
  };

  const SESSION_STORAGE_KEY = 'solarpv_sessions';
  const PANEL_STORAGE_KEY = 'solarpv_panels';
  const SETTINGS_STORAGE_KEY = 'solarpv_settings';

  const SYNC_QUEUE_KEY = 'solarpv_sync_queue_v1';
  const RETRY_BASE_MS = 5000;
  const RETRY_MAX_MS = 5 * 60 * 1000;

  let _app = null;
  let _auth = null;
  let _db = null;
  let _user = null;
  let _onAuthChange = null;

  let _queue = [];
  let _flushBusy = false;
  let _retryTimer = null;
  let _lastSessionToastAt = 0;
  let _syncState = {
    phase: 'idle', // idle | syncing | error
    pending: 0,
    lastError: '',
    retryAt: 0,
    lastSyncedAt: 0,
  };

  function _esc(value) {
    if (typeof App !== 'undefined' && App && typeof App.escapeHTML === 'function') {
      return App.escapeHTML(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _nowISO() {
    return new Date().toISOString();
  }

  function _toMillis(value) {
    if (!value) return 0;
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Date.parse(value);
      return isNaN(n) ? 0 : n;
    }
    if (typeof value === 'object') {
      if (typeof value.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date ? d.getTime() : 0;
      }
      if (typeof value.seconds === 'number') {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      }
    }
    return 0;
  }

  function _recordStamp(record, fallbackFields) {
    if (!record || typeof record !== 'object') return 0;
    let best = 0;
    ['updatedAt', 'deletedAt', '_syncedAt'].forEach(key => { best = Math.max(best, _toMillis(record[key])); });
    (fallbackFields || []).forEach(key => { best = Math.max(best, _toMillis(record[key])); });
    return best;
  }

  function _stripSyncFields(record) {
    const out = { ...(record || {}) };
    delete out._syncedAt;
    return out;
  }

  function _isDeleted(record) {
    return !!(record && record._deleted === true);
  }

  function _queueKey(type, id) {
    return `${type}:${id}`;
  }

  function _persistQueue() {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(_queue));
    } catch (e) {
      console.warn('FirebaseSync: queue persistence failed', e);
    }
  }

  function _loadQueue() {
    try {
      const raw = localStorage.getItem(SYNC_QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      _queue = Array.isArray(parsed) ? parsed : [];
    } catch {
      _queue = [];
    }
    _syncState.pending = _queue.length;
  }

  function _clone(payload) {
    if (typeof structuredClone === 'function') return structuredClone(payload);
    return JSON.parse(JSON.stringify(payload));
  }

  function _updateState(patch) {
    _syncState = { ..._syncState, ...patch, pending: _queue.length };
    _updateSignInUI();
  }

  function _nextRetryAt() {
    const now = Date.now();
    let min = 0;
    _queue.forEach(item => {
      const t = Number(item.nextRetryAt || 0);
      if (t > now && (min === 0 || t < min)) min = t;
    });
    return min;
  }

  function _retryEtaText() {
    if (!_syncState.retryAt) return '';
    const sec = Math.max(0, Math.ceil((_syncState.retryAt - Date.now()) / 1000));
    if (sec <= 0) return 'now';
    if (sec < 60) return `${sec}s`;
    const min = Math.ceil(sec / 60);
    return `${min}m`;
  }

  function _scheduleRetry() {
    clearTimeout(_retryTimer);
    _retryTimer = null;
    if (!isSignedIn() || _queue.length === 0) return;
    const when = _nextRetryAt();
    if (!when) return;
    const delay = Math.max(1000, when - Date.now());
    _retryTimer = setTimeout(() => { _flushQueue(); }, delay);
  }

  function _upsertQueueItem(type, id, payload) {
    const key = _queueKey(type, id);
    const idx = _queue.findIndex(item => _queueKey(item.type, item.id) === key);
    const base = {
      type,
      id,
      payload: _clone(payload),
      attempts: 0,
      nextRetryAt: 0,
      queuedAt: Date.now(),
      lastError: '',
    };
    if (idx >= 0) {
      const prev = _queue[idx];
      _queue[idx] = {
        ...prev,
        payload: base.payload,
        queuedAt: Date.now(),
      };
    } else {
      _queue.push(base);
    }
    _persistQueue();
    _updateState({ pending: _queue.length });
  }

  function _removeQueueItem(type, id) {
    const key = _queueKey(type, id);
    _queue = _queue.filter(item => _queueKey(item.type, item.id) !== key);
    _persistQueue();
  }

  function _upsertSessionQueuePayload(session) {
    if (!session || !session.id) return;
    const now = _nowISO();
    const payload = {
      ...session,
      id: String(session.id),
      createdAt: session.createdAt || session.updatedAt || now,
      updatedAt: session.updatedAt || now,
      _deleted: false,
      deletedAt: null,
    };
    _upsertQueueItem('session', String(payload.id), payload);
  }

  function _upsertPanelQueuePayload(panel) {
    if (!panel || !panel.id) return;
    const now = _nowISO();
    const payload = {
      ...panel,
      id: String(panel.id),
      createdAt: panel.createdAt || panel.updatedAt || now,
      updatedAt: panel.updatedAt || now,
      _deleted: false,
      deletedAt: null,
    };
    _upsertQueueItem('panel', String(payload.id), payload);
  }

  function _queueDeleteTombstone(type, id) {
    const now = _nowISO();
    _upsertQueueItem(type, String(id), {
      id: String(id),
      _deleted: true,
      deletedAt: now,
      updatedAt: now,
    });
  }

  function _mergeByUpdatedAt(localRecords, remoteMap, idField, fallbackFields) {
    const merged = {};
    (localRecords || []).forEach(record => {
      if (!record || typeof record !== 'object') return;
      const id = String(record[idField] || '');
      if (!id) return;
      merged[id] = _stripSyncFields(record);
    });

    Object.entries(remoteMap || {}).forEach(([id, remoteRaw]) => {
      const remote = _stripSyncFields(remoteRaw || {});
      const local = merged[id];
      const remoteStamp = _recordStamp(remote, fallbackFields);
      const localStamp = _recordStamp(local, fallbackFields);

      if (_isDeleted(remote)) {
        if (!local || remoteStamp >= localStamp) delete merged[id];
        return;
      }

      if (!local || remoteStamp >= localStamp) {
        remote[idField] = id;
        merged[id] = remote;
      }
    });

    return Object.values(merged);
  }

  function _syncToast(message, type, silent) {
    if (!silent && typeof App !== 'undefined' && App && typeof App.toast === 'function') {
      App.toast(message, type);
    }
  }

  // -------------------------------------------------------------------------
  // INIT
  // -------------------------------------------------------------------------

  function init(onAuthChange) {
    _onAuthChange = onAuthChange || null;
    _loadQueue();

    if (typeof firebase === 'undefined') {
      console.warn('FirebaseSync: Firebase SDK not loaded');
      return;
    }

    if (!firebase.apps.length) {
      _app = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      _app = firebase.app();
    }

    _auth = firebase.auth();
    _db = firebase.firestore();

    _db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence: multiple tabs open');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence not supported in this browser');
        }
      });

    _auth.onAuthStateChanged(user => {
      _user = user;
      _updateSignInUI();
      if (_onAuthChange) _onAuthChange(user);
      if (_user) _flushQueue();
    });
  }

  // -------------------------------------------------------------------------
  // AUTH
  // -------------------------------------------------------------------------

  function signIn() {
    if (!_auth) {
      App.toast('Firebase not ready', 'error');
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    _auth.signInWithPopup(provider).catch(err => {
      App.toast('Sign-in failed: ' + err.message, 'error');
    });
  }

  function signOut() {
    if (!_auth) return;
    _auth.signOut().then(() => {
      App.toast('Signed out');
    });
  }

  function getUser() { return _user; }
  function isSignedIn() { return !!_user; }

  // -------------------------------------------------------------------------
  // SIGN-IN UI
  // -------------------------------------------------------------------------

  function _statusChip() {
    if (!isSignedIn()) return '';
    if (_syncState.phase === 'syncing') return `<span class="fb-sync-chip info">Syncing...</span>`;
    if (_queue.length > 0) return `<span class="fb-sync-chip warn">Queued ${_queue.length}</span>`;
    if (_syncState.phase === 'error') return `<span class="fb-sync-chip danger">Retry</span>`;
    if (_syncState.lastSyncedAt) return `<span class="fb-sync-chip ok">Synced</span>`;
    return `<span class="fb-sync-chip">Ready</span>`;
  }

  function _statusSummaryHtml() {
    const statusText =
      _syncState.phase === 'syncing' ? 'Syncing to cloud' :
      _syncState.phase === 'error' ? 'Waiting for retry' :
      _queue.length > 0 ? 'Pending sync items' : 'Cloud sync healthy';

    const retry = _retryEtaText();
    const retryLine = retry ? `<div class="fb-sync-meta">Next retry: ${_esc(retry)}</div>` : '';
    const errLine = _syncState.lastError
      ? `<div class="fb-sync-error">${_esc(_syncState.lastError)}</div>`
      : '';

    return `
      <div class="fb-sync-state">
        <div><strong>Status:</strong> ${_esc(statusText)}</div>
        <div><strong>Queue:</strong> ${_queue.length}</div>
        ${retryLine}
        ${errLine}
      </div>
    `;
  }

  function _updateSignInUI() {
    const btn = document.getElementById('fb-signin-btn');
    if (!btn) return;

    if (_user) {
      const name = _user.displayName ? _user.displayName.split(' ')[0] : 'User';
      const safeName = _esc(name);
      const safeEmail = _esc(_user.email || '');
      const photo = _user.photoURL ? _esc(_user.photoURL) : '';
      btn.innerHTML = photo
        ? `<img src="${photo}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:4px" alt=""><span>${safeName}</span>${_statusChip()}`
        : `&#128100; <span>${safeName}</span>${_statusChip()}`;
      btn.title = `Signed in as ${safeEmail}\nClick for sync menu`;
      btn.classList.add('signed-in');
    } else {
      btn.innerHTML = '&#128274; Sign In';
      btn.title = 'Sign in with Google to sync data across devices';
      btn.classList.remove('signed-in');
    }
  }

  function renderSignInButton(container) {
    const btn = document.createElement('button');
    btn.id = 'fb-signin-btn';
    btn.className = 'fb-signin-btn';
    btn.innerHTML = '&#128274; Sign In';
    btn.title = 'Sign in with Google to sync your data';
    btn.addEventListener('click', () => {
      if (_user) _showAccountMenu(btn);
      else signIn();
    });
    container.appendChild(btn);
    _updateSignInUI();
    return btn;
  }

  function _showAccountMenu(anchor) {
    const old = document.getElementById('fb-account-menu');
    if (old) {
      old.remove();
      return;
    }

    const safeEmail = _esc(_user && _user.email ? _user.email : '');
    const canRetry = _queue.length > 0;

    const menu = document.createElement('div');
    menu.id = 'fb-account-menu';
    menu.className = 'fb-account-menu';
    menu.innerHTML = `
      <div class="fb-account-email">${safeEmail}</div>
      ${_statusSummaryHtml()}
      <div class="fb-account-divider"></div>
      <button id="fb-sync-now-btn" class="fb-menu-item">&#8635; Sync Now</button>
      <button id="fb-retry-btn" class="fb-menu-item" ${canRetry ? '' : 'disabled'}>Retry Queue (${_queue.length})</button>
      <button id="fb-signout-btn" class="fb-menu-item fb-menu-danger">&#128274; Sign Out</button>
    `;
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';

    menu.querySelector('#fb-sync-now-btn').addEventListener('click', () => {
      menu.remove();
      syncAll();
    });

    menu.querySelector('#fb-retry-btn').addEventListener('click', () => {
      menu.remove();
      retryQueue();
    });

    menu.querySelector('#fb-signout-btn').addEventListener('click', () => {
      menu.remove();
      signOut();
    });

    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', _close);
        }
      });
    }, 50);
  }

  // -------------------------------------------------------------------------
  // FIRESTORE HELPERS
  // -------------------------------------------------------------------------

  function _userDoc(path) {
    if (!_user || !_db) return null;
    return _db.doc(`users/${_user.uid}/${path}`);
  }

  function _userCol(path) {
    if (!_user || !_db) return null;
    return _db.collection(`users/${_user.uid}/${path}`);
  }

  async function _pullCollection(path) {
    if (!isSignedIn()) return null;
    const col = _userCol(path);
    if (!col) return null;
    try {
      const snap = await col.get();
      const remote = {};
      snap.forEach(doc => { remote[doc.id] = { id: doc.id, ...doc.data() }; });
      return remote;
    } catch (e) {
      console.error(`FirebaseSync.pullCollection(${path}):`, e);
      return null;
    }
  }

  async function _pushQueueItem(item) {
    if (!isSignedIn()) throw new Error('Not signed in');
    if (!_db) throw new Error('Firestore unavailable');

    if (item.type === 'session') {
      const col = _userCol('sessions');
      if (!col) throw new Error('Session collection unavailable');
      await col.doc(String(item.id)).set({
        ..._clone(item.payload),
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    if (item.type === 'panel') {
      const col = _userCol('panels');
      if (!col) throw new Error('Panel collection unavailable');
      await col.doc(String(item.id)).set({
        ..._clone(item.payload),
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    if (item.type === 'settings') {
      const ref = _userDoc('meta/settings');
      if (!ref) throw new Error('Settings document unavailable');
      await ref.set({
        ..._clone(item.payload),
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    throw new Error('Unknown queue item type: ' + item.type);
  }

  async function _flushQueue() {
    if (_flushBusy || !isSignedIn()) return false;
    if (_queue.length === 0) {
      _updateState({ phase: 'idle', lastError: '', retryAt: 0 });
      return true;
    }

    clearTimeout(_retryTimer);
    _retryTimer = null;
    _flushBusy = true;
    _updateState({ phase: 'syncing', lastError: '' });

    let hadError = false;
    let errorMessage = '';
    const now = Date.now();

    for (const item of _queue.slice()) {
      if (item.nextRetryAt && item.nextRetryAt > now) continue;
      try {
        await _pushQueueItem(item);
        _removeQueueItem(item.type, item.id);
      } catch (e) {
        hadError = true;
        errorMessage = e && e.message ? e.message : 'Sync failed';
        const idx = _queue.findIndex(q => _queueKey(q.type, q.id) === _queueKey(item.type, item.id));
        if (idx >= 0) {
          const attempts = Number(_queue[idx].attempts || 0) + 1;
          const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)));
          _queue[idx] = {
            ..._queue[idx],
            attempts,
            lastError: errorMessage,
            nextRetryAt: Date.now() + delay,
          };
        }
      }
    }

    _persistQueue();
    _flushBusy = false;

    if (hadError) {
      const retryAt = _nextRetryAt();
      _updateState({ phase: 'error', lastError: errorMessage, retryAt });
      _scheduleRetry();
      return false;
    }

    if (_queue.length > 0) {
      const retryAt = _nextRetryAt();
      _updateState({ phase: 'idle', retryAt, lastError: '' });
      _scheduleRetry();
      return true;
    }

    _updateState({ phase: 'idle', lastError: '', retryAt: 0, lastSyncedAt: Date.now() });
    return true;
  }

  function retryQueue() {
    if (!isSignedIn()) {
      App.toast('Sign in to retry sync', 'warning');
      return;
    }
    _queue = _queue.map(item => ({ ...item, nextRetryAt: 0 }));
    _persistQueue();
    _updateState({ phase: 'syncing', lastError: '' });
    _flushQueue();
  }

  function getSyncState() {
    return {
      ..._syncState,
      pending: _queue.length,
      retryInSec: _syncState.retryAt ? Math.max(0, Math.ceil((_syncState.retryAt - Date.now()) / 1000)) : 0,
    };
  }

  // -------------------------------------------------------------------------
  // SESSIONS
  // -------------------------------------------------------------------------

  function _prepareSessionForSync(session) {
    if (!session || !session.id) return null;
    const now = _nowISO();
    const out = _stripSyncFields(session);
    out.id = String(session.id);
    out.createdAt = out.createdAt || out.updatedAt || now;
    out.updatedAt = out.updatedAt || out.createdAt || now;
    if (out._deleted) {
      out._deleted = true;
      out.deletedAt = out.deletedAt || out.updatedAt || now;
    } else {
      out._deleted = false;
      out.deletedAt = null;
    }
    return out;
  }

  async function saveSession(session) {
    if (!isSignedIn()) return false;
    const payload = _prepareSessionForSync(session);
    if (!payload) return false;
    _upsertSessionQueuePayload(payload);
    _flushQueue();
    return true;
  }

  async function pullSessions() {
    return _pullCollection('sessions');
  }

  async function syncSessions(options) {
    const opts = options || {};
    const silent = !!opts.silent;

    if (!isSignedIn()) {
      _syncToast('Sign in to sync data', 'warning', silent);
      return null;
    }

    let local = [];
    try { local = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]'); } catch {}
    const preparedLocal = local
      .map(_prepareSessionForSync)
      .filter(Boolean)
      .filter(s => !s._deleted);

    preparedLocal.forEach(s => _upsertSessionQueuePayload(s));
    await _flushQueue();

    const remote = await pullSessions();
    if (!remote) {
      _updateState({ phase: 'error', lastError: 'Failed to pull sessions from cloud' });
      _syncToast(`Session sync incomplete - ${_queue.length} queued`, 'warning', silent);
      return null;
    }

    const merged = _mergeByUpdatedAt(preparedLocal, remote, 'id', ['date', 'createdAt'])
      .filter(s => !s._deleted)
      .sort((a, b) => _recordStamp(b, ['date', 'createdAt']) - _recordStamp(a, ['date', 'createdAt']));

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function onSessionSaved(session) {
    if (!isSignedIn()) return;
    saveSession(session).then(ok => {
      if (!ok) return;
      setTimeout(() => {
        const now = Date.now();
        if (now - _lastSessionToastAt < 12000) return;
        _lastSessionToastAt = now;
        if (_queue.length > 0) {
          App.toast(`Saved locally - ${_queue.length} pending sync`, 'warning');
        } else {
          App.toast('Saved and synced to cloud', 'success');
        }
      }, 60);
    });
  }

  function onSessionDeleted(sessionId) {
    if (!isSignedIn() || !sessionId) return;
    _queueDeleteTombstone('session', String(sessionId));
    _flushQueue();
  }

  // -------------------------------------------------------------------------
  // PANELS
  // -------------------------------------------------------------------------

  function _preparePanelForSync(panel) {
    if (!panel || !panel.id) return null;
    const now = _nowISO();
    const out = _stripSyncFields(panel);
    out.id = String(panel.id);
    out.createdAt = out.createdAt || out.updatedAt || now;
    out.updatedAt = out.updatedAt || out.createdAt || now;
    if (out._deleted) {
      out._deleted = true;
      out.deletedAt = out.deletedAt || out.updatedAt || now;
    } else {
      out._deleted = false;
      out.deletedAt = null;
    }
    return out;
  }

  async function savePanel(panel) {
    if (!isSignedIn()) return false;
    const payload = _preparePanelForSync(panel);
    if (!payload) return false;
    _upsertPanelQueuePayload(payload);
    _flushQueue();
    return true;
  }

  async function pullPanels() {
    return _pullCollection('panels');
  }

  async function syncPanels(options) {
    const opts = options || {};
    const silent = !!opts.silent;

    if (!isSignedIn()) {
      _syncToast('Sign in to sync panels', 'warning', silent);
      return null;
    }

    let localPanels = [];
    try { localPanels = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || '[]'); } catch {}
    const preparedLocal = localPanels
      .map(_preparePanelForSync)
      .filter(Boolean)
      .filter(p => !p._deleted);

    preparedLocal.forEach(p => _upsertPanelQueuePayload(p));
    await _flushQueue();

    const remote = await pullPanels();
    if (!remote) {
      _updateState({ phase: 'error', lastError: 'Failed to pull panels from cloud' });
      _syncToast(`Panel sync incomplete - ${_queue.length} queued`, 'warning', silent);
      return null;
    }

    const merged = _mergeByUpdatedAt(preparedLocal, remote, 'id', ['createdAt'])
      .filter(p => !p._deleted)
      .sort((a, b) => {
        const am = String(a.manufacturer || '');
        const bm = String(b.manufacturer || '');
        const mm = am.localeCompare(bm);
        if (mm !== 0) return mm;
        return String(a.model || '').localeCompare(String(b.model || ''));
      });

    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function onPanelSaved(panel) {
    if (!isSignedIn()) return;
    savePanel(panel);
  }

  function onPanelDeleted(panelId) {
    if (!isSignedIn() || !panelId) return;
    _queueDeleteTombstone('panel', String(panelId));
    _flushQueue();
  }

  // -------------------------------------------------------------------------
  // SETTINGS
  // -------------------------------------------------------------------------

  async function saveSettings(settings) {
    if (!isSignedIn()) return;
    _upsertQueueItem('settings', 'meta_settings', settings || {});
    _flushQueue();
  }

  async function pullSettings() {
    if (!isSignedIn()) return null;
    const ref = _userDoc('meta/settings');
    if (!ref) return null;
    try {
      const snap = await ref.get();
      return snap.exists ? snap.data() : null;
    } catch (e) {
      console.error('FirebaseSync.pullSettings:', e);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // FULL SYNC
  // -------------------------------------------------------------------------

  async function syncAll() {
    if (!isSignedIn()) {
      App.toast('Sign in to sync data', 'warning');
      return null;
    }

    App.toast('Syncing...', 'info');

    const sessions = await syncSessions({ silent: true });
    const panels = await syncPanels({ silent: true });

    const remoteSettings = await pullSettings();
    if (remoteSettings) {
      const local = {};
      try { Object.assign(local, JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}')); } catch {}
      if (!local.inspectorName && remoteSettings.inspectorName) {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(remoteSettings));
        App.toast('Settings restored from cloud', 'info');
      }
    }

    await _flushQueue();

    if (_queue.length > 0) {
      App.toast(`Sync partial - ${_queue.length} queued for retry`, 'warning');
    } else {
      const sessionCount = Array.isArray(sessions) ? sessions.length : '-';
      const panelCount = Array.isArray(panels) ? panels.length : '-';
      App.toast(`Sync complete - ${sessionCount} sessions, ${panelCount} panels`, 'success');
    }

    return { sessions, panels, queuePending: _queue.length };
  }

  return {
    init,
    signIn,
    signOut,
    getUser,
    isSignedIn,
    renderSignInButton,
    saveSession,
    pullSessions,
    syncSessions,
    savePanel,
    pullPanels,
    syncPanels,
    saveSettings,
    pullSettings,
    syncAll,
    onSessionSaved,
    onSessionDeleted,
    onPanelSaved,
    onPanelDeleted,
    retryQueue,
    getSyncState,
  };
})();

