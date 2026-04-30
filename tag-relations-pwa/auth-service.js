// PWA auth: Firebase REST (same as desktop) with extension-style sign-in / highlight merge.
// Tags/highlights stay in mnemomark-tags + lector-highlights:* (web app layout).

let currentUser = null;
let shareTags = false;
let shareHighlights = false;
let tagSyncIntervalId = null;
let highlightSyncIntervalId = null;
let tokenRefreshTimeout = null;

const AUTH_STORAGE_KEY = 'mnemomark-auth-state';
const TAGS_STORAGE_KEY = 'mnemomark-tags';

function getAuthConfig() {
  const config = window.authConfig || {};
  if (!config.apiKey || !config.projectId) {
    console.warn('Auth not configured. Update auth-config.js with your Firebase project values.');
    return null;
  }
  return config;
}

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function getIdToken() {
  return currentUser ? currentUser.idToken : null;
}

function setAuthState(user) {
  currentUser = user;
  shareTags = user ? true : false;
  shareHighlights = user ? true : false;
  window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user, shareTags, shareHighlights } }));
}

function clearRefreshTimer() {
  if (tokenRefreshTimeout) {
    clearTimeout(tokenRefreshTimeout);
    tokenRefreshTimeout = null;
  }
}

function scheduleTokenRefresh(expiresAtMs) {
  clearRefreshTimer();
  if (!expiresAtMs) return;
  const refreshInMs = Math.max(expiresAtMs - Date.now() - 60 * 1000, 5 * 1000);
  tokenRefreshTimeout = setTimeout(() => {
    refreshAuthToken().catch(() => {
      signOutUser();
    });
  }, refreshInMs);
}

function decodeJwtExp(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch (error) {
    return null;
  }
}

function storeAuthState(user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

function loadStoredAuthState() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function readLocalTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGS_STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function writeLocalTags(tags) {
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags || []));
}

// Extension parity: remote wins on same highlight id; keep local-only rows (not yet on server).
function mergeRemoteHighlightsIntoLocal(remote, local) {
  const r = Array.isArray(remote) ? remote : [];
  const l = Array.isArray(local) ? local : [];
  const remoteIds = new Set(r.map((h) => (h && h.id != null ? String(h.id) : null)).filter(Boolean));
  const localOnly = l.filter((h) => h && h.id != null && !remoteIds.has(String(h.id)));
  return [...r, ...localOnly];
}

function readFlatHighlightsWithFilePath() {
  const all = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lector-highlights:')) {
      const filePath = key.replace('lector-highlights:', '');
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        arr.forEach((h) => {
          if (h && typeof h === 'object') {
            all.push({ ...h, filePath: h.filePath || filePath });
          }
        });
      } catch (err) {
        /* skip */
      }
    }
  }
  return all;
}

function writeHighlightsByPathFromFlat(flatArray) {
  const highlightsByPath = {};
  (flatArray || []).forEach((h) => {
    if (!h || typeof h !== 'object') return;
    const fp = h.filePath != null ? String(h.filePath) : '';
    if (!fp) return;
    if (!highlightsByPath[fp]) highlightsByPath[fp] = [];
    const { filePath: _omit, ...rest } = h;
    highlightsByPath[fp].push(rest);
  });
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lector-highlights:')) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  Object.keys(highlightsByPath).forEach((filePath) => {
    localStorage.setItem(`lector-highlights:${filePath}`, JSON.stringify(highlightsByPath[filePath]));
  });
}

async function refreshAuthToken() {
  const config = getAuthConfig();
  if (!config || !currentUser || !currentUser.refreshToken) return false;

  const response = await fetchWithTimeout(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(currentUser.refreshToken)}`
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  const updatedUser = {
    ...currentUser,
    idToken: data.id_token,
    refreshToken: data.refresh_token || currentUser.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in) * 1000
  };

  storeAuthState(updatedUser);
  setAuthState(updatedUser);
  scheduleTokenRefresh(updatedUser.expiresAt);
  return true;
}

async function ensureValidToken() {
  if (!currentUser || !currentUser.idToken) return false;
  const exp = currentUser.expiresAt || decodeJwtExp(currentUser.idToken);
  if (!exp || exp - Date.now() < 60 * 1000) {
    return refreshAuthToken();
  }
  return true;
}

function firestoreBaseUrl() {
  const config = getAuthConfig();
  if (!config) return null;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach((key) => {
      if (value[key] !== undefined) {
        fields[key] = toFirestoreValue(value[key]);
      }
    });
    return { mapValue: { fields } };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    const obj = {};
    Object.keys(fields).forEach((key) => {
      obj[key] = fromFirestoreValue(fields[key]);
    });
    return obj;
  }
  return null;
}

async function firestoreGetDocument(docPath) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return null;
  const ok = await ensureValidToken();
  if (!ok) return null;

  const response = await fetch(`${baseUrl}/${docPath}`, {
    headers: { Authorization: `Bearer ${getIdToken()}` }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function firestorePatchDocument(docPath, fields) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return false;
  const ok = await ensureValidToken();
  if (!ok) return false;

  const updateMask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

  const response = await fetch(`${baseUrl}/${docPath}?${updateMask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getIdToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  return response.ok;
}

async function firestoreDeleteDocument(docPath) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return false;
  const ok = await ensureValidToken();
  if (!ok) return false;

  const response = await fetch(`${baseUrl}/${docPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getIdToken()}` }
  });

  return response.ok;
}

async function initAuth() {
  const stored = loadStoredAuthState();
  if (stored && stored.idToken) {
    setAuthState(stored);
    await ensureValidToken();
    scheduleTokenRefresh(currentUser ? currentUser.expiresAt : null);
    if (currentUser) {
      await loadUserSettings();
      void (async () => {
        try {
          if (!shareTags) {
            const tagsDoc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
            if (tagsDoc && tagsDoc.fields && tagsDoc.fields.tags) {
              shareTags = true;
              currentUser.shareTags = true;
              storeAuthState(currentUser);
              setAuthState(currentUser);
            }
          }
          await syncHighlightsFromCloud();
        } catch (err) {
          console.error('MnemoMark: initAuth cloud sync failed', err);
        } finally {
          setupTagSyncListener();
          setupHighlightSyncListener();
        }
      })();
    }
  } else {
    setAuthState(null);
  }
  return true;
}

async function signUp(email, password, shareTagsOption) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const response = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Sign up failed.',
        raw: JSON.stringify(data)
      };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: true
    };

    storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    await firestorePatchDocument(`users/${encodeURIComponent(user.uid)}`, {
      email: toFirestoreValue(user.email),
      shareTags: toFirestoreValue(true),
      createdAt: toFirestoreValue(new Date().toISOString())
    });

    await syncTagsToCloud();
    setupTagSyncListener();
    await syncHighlightsToCloud();
    setupHighlightSyncListener();

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Sign up failed.',
      raw: String(error)
    };
  }
}

// Extension-style: tags like extension; highlights use flat list + id set (matches extension mergePreSignInData).
async function mergePreSignInData(preSignInTags, preSignInHighlightsFlat) {
  if (preSignInTags.length > 0) {
    const cloudTags = readLocalTags();
    const cloudTagIds = new Set(cloudTags.map((t) => t.id));
    const uniqueLocalTags = preSignInTags.filter((t) => !cloudTagIds.has(t.id));
    if (uniqueLocalTags.length > 0) {
      writeLocalTags([...cloudTags, ...uniqueLocalTags]);
      await syncTagsToCloud();
    }
  }

  if (preSignInHighlightsFlat.length > 0) {
    const flatAfterSync = readFlatHighlightsWithFilePath();
    const cloudIds = new Set(flatAfterSync.map((h) => h.id));
    const uniqueLocal = preSignInHighlightsFlat.filter((h) => !cloudIds.has(h.id));
    if (uniqueLocal.length > 0) {
      const merged = [...flatAfterSync, ...uniqueLocal];
      writeHighlightsByPathFromFlat(merged);
      await syncHighlightsToCloud();
    }
  }
}

async function signIn(email, password) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const preSignInTags = readLocalTags();
    const preSignInHighlights = readFlatHighlightsWithFilePath();

    const response = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Sign in failed.',
        raw: JSON.stringify(data)
      };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: true
    };

    storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    await syncTagsFromCloud();
    setupTagSyncListener();
    await syncHighlightsFromCloud();
    setupHighlightSyncListener();

    await mergePreSignInData(preSignInTags, preSignInHighlights);

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Sign in failed.',
      raw: String(error)
    };
  }
}

async function signOutUser() {
  clearRefreshTimer();
  if (tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
    tagSyncIntervalId = null;
  }
  if (highlightSyncIntervalId) {
    clearInterval(highlightSyncIntervalId);
    highlightSyncIntervalId = null;
  }

  localStorage.removeItem(TAGS_STORAGE_KEY);
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lector-highlights:')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));

  localStorage.removeItem(AUTH_STORAGE_KEY);
  setAuthState(null);
  localStorage.setItem('mnemomark-auth-sync', String(Date.now()));
  return { success: true };
}

async function deleteAccount() {
  const config = getAuthConfig();
  if (!config || !currentUser || !currentUser.idToken) {
    return { success: false, error: 'Not signed in.' };
  }
  const ok = await ensureValidToken();
  if (!ok) {
    return { success: false, error: 'Session expired. Please sign in again.' };
  }

  await firestoreDeleteDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
  await firestoreDeleteDocument(`users/${encodeURIComponent(currentUser.uid)}`);

  const response = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: currentUser.idToken })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error ? data.error.message : 'Delete account failed.'
    };
  }

  await signOutUser();
  return { success: true };
}

async function sendPasswordResetEmail(email) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const response = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Reset email failed.',
        raw: JSON.stringify(data)
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Reset email failed.',
      raw: String(error)
    };
  }
}

async function loadUserSettings() {
  if (!currentUser) return;

  shareTags = true;
  currentUser.shareTags = true;
  storeAuthState(currentUser);
  setAuthState(currentUser);
}

async function syncTagsToCloud() {
  if (!currentUser || !shareTags) return;
  const tags = readLocalTags();

  await firestorePatchDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`, {
    tags: toFirestoreValue(tags),
    updatedAt: toFirestoreValue(new Date().toISOString())
  });
}

async function syncTagsFromCloud() {
  if (!currentUser || !shareTags) return;
  const doc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
  if (doc && doc.fields && doc.fields.tags) {
    const tags = fromFirestoreValue(doc.fields.tags) || [];
    writeLocalTags(tags);
    window.dispatchEvent(new CustomEvent('tagsSynced', { detail: { tags } }));
    return { success: true, tags };
  }
  return { success: true, tags: [] };
}

function setupTagSyncListener() {
  if (tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
  }
  tagSyncIntervalId = setInterval(() => {
    syncTagsFromCloud().catch(() => {});
  }, 60 * 1000);
}

async function syncHighlightsToCloud() {
  if (!currentUser) return;

  const allHighlights = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lector-highlights:')) {
      try {
        const highlights = JSON.parse(localStorage.getItem(key) || '[]');
        const filePath = key.replace('lector-highlights:', '');
        highlights.forEach((h) => {
          h.filePath = filePath;
        });
        allHighlights.push(...highlights);
      } catch (err) {
        console.error('Error reading highlights from', key, err);
      }
    }
  }

  await firestorePatchDocument(`users/${encodeURIComponent(currentUser.uid)}/data/highlights`, {
    highlights: toFirestoreValue(allHighlights),
    updatedAt: toFirestoreValue(new Date().toISOString())
  });
}

// Extension-style pull: merge Firestore with flat local aggregate, then fan out to lector-highlights:* .
async function syncHighlightsFromCloud() {
  if (!currentUser) return;
  const flatLocal = readFlatHighlightsWithFilePath();

  const doc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/highlights`);
  let merged = flatLocal;
  if (doc && doc.fields && doc.fields.highlights) {
    const remoteHighlights = fromFirestoreValue(doc.fields.highlights) || [];
    merged = mergeRemoteHighlightsIntoLocal(remoteHighlights, flatLocal);
  }

  writeHighlightsByPathFromFlat(merged);
  window.dispatchEvent(new CustomEvent('highlightsSynced', { detail: { highlights: merged } }));
  return { success: true, highlights: merged };
}

function setupHighlightSyncListener() {
  if (highlightSyncIntervalId) {
    clearInterval(highlightSyncIntervalId);
  }
  highlightSyncIntervalId = setInterval(() => {
    syncHighlightsFromCloud().catch(() => {});
  }, 60 * 1000);
}

function getCurrentUser() {
  return currentUser;
}

function isSharingTags() {
  return shareTags;
}

async function reconcileShareTags() {
  if (currentUser && !shareTags) {
    shareTags = true;
    currentUser.shareTags = true;
    storeAuthState(currentUser);
    setAuthState(currentUser);
    await syncTagsFromCloud();
    setupTagSyncListener();
  }
  return shareTags;
}

initAuth();

window.authService = {
  signUp,
  signIn,
  signOut: signOutUser,
  deleteAccount,
  sendPasswordResetEmail,
  getCurrentUser,
  isSharingTags,
  reconcileShareTags,
  syncTagsToCloud,
  syncTagsFromCloud,
  syncHighlightsToCloud,
  syncHighlightsFromCloud,
  initAuth
};

window.addEventListener('storage', (event) => {
  if (event.key !== AUTH_STORAGE_KEY) return;
  const stored = loadStoredAuthState();
  if (stored && stored.idToken) {
    setAuthState(stored);
  } else {
    setAuthState(null);
  }
});
