/**
 * firebase-sync.js — Google Sign-In + Firestore sync for SolarPV Field Tool
 * Uses Firebase compat SDK (no ES modules, works with plain script tags)
 * Data path: users/{uid}/sessions/{sessionId}
 *             users/{uid}/panels (custom panel DB)
 *             users/{uid}/settings
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

  let _app = null;
  let _auth = null;
  let _db = null;
  let _user = null;
  let _onAuthChange = null; // callback(user)

  // -------------------------------------------------------------------------
  // INIT
  // -------------------------------------------------------------------------

  function init(onAuthChange) {
    _onAuthChange = onAuthChange || null;

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
    _db   = firebase.firestore();

    // Enable offline persistence (Firestore caches locally)
    _db.enablePersistence({ synchronizeTabs: true })
       .catch(err => {
         if (err.code === 'failed-precondition') {
           // Multiple tabs open — persistence only in one tab
           console.warn('Firestore persistence: multiple tabs open');
         } else if (err.code === 'unimplemented') {
           console.warn('Firestore persistence not supported in this browser');
         }
       });

    // Listen for auth state changes
    _auth.onAuthStateChanged(user => {
      _user = user;
      _updateSignInUI();
      if (_onAuthChange) _onAuthChange(user);
    });
  }

  // -------------------------------------------------------------------------
  // AUTH
  // -------------------------------------------------------------------------

  function signIn() {
    if (!_auth) { App.toast('Firebase not ready', 'error'); return; }
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
  // SIGN-IN UI (header button)
  // -------------------------------------------------------------------------

  function _updateSignInUI() {
    const btn = document.getElementById('fb-signin-btn');
    if (!btn) return;
    if (_user) {
      const name = _user.displayName ? _user.displayName.split(' ')[0] : 'User';
      const photo = _user.photoURL;
      btn.innerHTML = photo
        ? `<img src="${photo}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:4px">${name}`
        : `&#128100; ${name}`;
      btn.title = `Signed in as ${_user.email}\nClick to sign out`;
      btn.classList.add('signed-in');
    } else {
      btn.innerHTML = '&#128274; Sign In';
      btn.title = 'Sign in with Google to sync data across devices';
      btn.classList.remove('signed-in');
    }
  }

  function renderSignInButton(container) {
    // Injects a sign-in button — called from header init
    const btn = document.createElement('button');
    btn.id = 'fb-signin-btn';
    btn.className = 'fb-signin-btn';
    btn.innerHTML = '&#128274; Sign In';
    btn.title = 'Sign in with Google to sync your data';
    btn.addEventListener('click', () => {
      if (_user) {
        // Show account menu
        _showAccountMenu(btn);
      } else {
        signIn();
      }
    });
    container.appendChild(btn);
    _updateSignInUI();
    return btn;
  }

  function _showAccountMenu(anchor) {
    // Remove any existing menu
    const old = document.getElementById('fb-account-menu');
    if (old) { old.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'fb-account-menu';
    menu.className = 'fb-account-menu';
    menu.innerHTML = `
      <div class="fb-account-email">${_user.email}</div>
      <div class="fb-account-divider"></div>
      <button id="fb-sync-now-btn" class="fb-menu-item">&#8635; Sync Now</button>
      <button id="fb-signout-btn"  class="fb-menu-item fb-menu-danger">&#128274; Sign Out</button>
    `;

    document.body.appendChild(menu);

    // Position below anchor
    const rect = anchor.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';

    menu.querySelector('#fb-sync-now-btn').addEventListener('click', () => {
      menu.remove();
      syncAll();
    });
    menu.querySelector('#fb-signout-btn').addEventListener('click', () => {
      menu.remove();
      signOut();
    });

    // Close on outside click
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

  // -------------------------------------------------------------------------
  // SESSIONS SYNC
  // -------------------------------------------------------------------------

  /**
   * Push a single inspection session to Firestore.
   * session = { id, siteName, date, inspector, ... }
   */
  async function saveSession(session) {
    if (!isSignedIn()) return false;
    const col = _userCol('sessions');
    if (!col) return false;
    try {
      await col.doc(String(session.id)).set({
        ...session,
        _syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error('FirebaseSync.saveSession:', e);
      return false;
    }
  }

  /**
   * Pull all sessions from Firestore → merge into localStorage.
   * Firestore wins on conflict (server timestamp is newer).
   */
  async function pullSessions() {
    if (!isSignedIn()) return null;
    const col = _userCol('sessions');
    if (!col) return null;
    try {
      const snap = await col.orderBy('date', 'desc').get();
      const remote = {};
      snap.forEach(doc => { remote[doc.id] = doc.data(); });
      return remote;
    } catch (e) {
      console.error('FirebaseSync.pullSessions:', e);
      return null;
    }
  }

  /**
   * Full sync: push all local sessions, then pull remote sessions,
   * merge result back to localStorage.
   */
  async function syncSessions() {
    if (!isSignedIn()) {
      App.toast('Sign in to sync data', 'warning');
      return;
    }

    App.toast('Syncing...', 'info');

    // Load local sessions
    let local = [];
    try { local = JSON.parse(localStorage.getItem('solarpv_sessions') || '[]'); } catch {}

    // Push all local → Firestore
    const pushAll = local.map(s => saveSession(s));
    await Promise.all(pushAll);

    // Pull all remote
    const remote = await pullSessions();
    if (!remote) { App.toast('Sync error — check connection', 'error'); return; }

    // Merge: remote wins over local if same ID (fresher from another device)
    const localMap = {};
    local.forEach(s => { localMap[String(s.id)] = s; });

    Object.entries(remote).forEach(([id, data]) => {
      localMap[id] = data;
    });

    const merged = Object.values(localMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    localStorage.setItem('solarpv_sessions', JSON.stringify(merged));
    App.toast(`Sync complete — ${merged.length} inspections`, 'success');
    return merged;
  }

  // -------------------------------------------------------------------------
  // SETTINGS SYNC
  // -------------------------------------------------------------------------

  async function saveSettings(settings) {
    if (!isSignedIn()) return;
    const ref = _userDoc('meta/settings');
    if (!ref) return;
    try {
      await ref.set({ ...settings, _syncedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) {
      console.error('FirebaseSync.saveSettings:', e);
    }
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
  // FULL SYNC (sessions + settings)
  // -------------------------------------------------------------------------

  async function syncAll() {
    await syncSessions();
    // Pull remote settings → apply if local is empty
    const remote = await pullSettings();
    if (remote) {
      const local = {};
      try { Object.assign(local, JSON.parse(localStorage.getItem('solarpv_settings') || '{}')); } catch {}
      if (!local.inspectorName && remote.inspectorName) {
        localStorage.setItem('solarpv_settings', JSON.stringify(remote));
        App.toast('Settings restored from cloud', 'info');
      }
    }
  }

  // -------------------------------------------------------------------------
  // AUTO-SYNC HOOK
  // Called by inspection.js after saving a session
  // -------------------------------------------------------------------------

  function onSessionSaved(session) {
    if (isSignedIn()) {
      saveSession(session).then(ok => {
        if (ok) App.toast('Saved & synced to cloud &#9729;', 'success');
      });
    }
  }

  // -------------------------------------------------------------------------
  // FIRESTORE SECURITY RULES (informational — apply in Firebase console)
  // -------------------------------------------------------------------------
  /*
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /users/{userId}/{document=**} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  */

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
    saveSettings,
    pullSettings,
    syncAll,
    onSessionSaved
  };

})();
