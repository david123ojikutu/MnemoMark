// Authentication and cloud sync using Firebase REST APIs (data-only).
// This avoids remotely hosted code while preserving sign-in and sync.

let currentUser = null;
let shareTags = false;
let shareHighlights = false;
let tagSyncIntervalId = null;
let highlightSyncIntervalId = null;
let tokenRefreshTimeout = null;

const AUTH_STORAGE_KEY = 'authState';

function getAuthConfig() {
  const config = window.authConfig || {};
  if (!config.apiKey || !config.projectId) {
    console.warn('Auth not configured. Update auth-config.js with your Firebase project values.');
    return null;
  }
  return config;
}

function getIdToken() {
  return currentUser ? currentUser.idToken : null;
}

function setAuthState(user) {
  currentUser = user;
  shareTags = user ? true : false; // Always sync tags when logged in
  shareHighlights = user ? true : false; // Highlights are always synced when logged in
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
      // If refresh fails, force sign out so UI reflects it.
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
  return chrome.storage.local.set({ [AUTH_STORAGE_KEY]: user });
}

async function loadStoredAuthState() {
  const result = await chrome.storage.local.get([AUTH_STORAGE_KEY]);
  return result[AUTH_STORAGE_KEY] || null;
}

async function refreshAuthToken() {
  const config = getAuthConfig();
  if (!config || !currentUser || !currentUser.refreshToken) return false;

  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
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

  await storeAuthState(updatedUser);
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
  const stored = await loadStoredAuthState();
  if (stored && stored.idToken) {
    setAuthState(stored);
    await ensureValidToken();
    scheduleTokenRefresh(currentUser ? currentUser.expiresAt : null);
    if (currentUser) {
      await loadUserSettings();
      if (!shareTags) {
        const tagsDoc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
        if (tagsDoc && tagsDoc.fields && tagsDoc.fields.tags) {
          shareTags = true;
          currentUser.shareTags = true;
          await storeAuthState(currentUser);
          setAuthState(currentUser);
        }
      }
      // Always sync tags and highlights when logged in
        setupTagSyncListener();
      await syncHighlightsFromCloud();
      setupHighlightSyncListener();
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
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ? data.error.message : 'Sign up failed.' };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: true // Always sync tags
    };

    await storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    await firestorePatchDocument(`users/${encodeURIComponent(user.uid)}`, {
      email: toFirestoreValue(user.email),
      shareTags: toFirestoreValue(true), // Always sync tags
      createdAt: toFirestoreValue(new Date().toISOString())
    });

    // Always sync tags and highlights when logged in
      await syncTagsToCloud();
      setupTagSyncListener();
    await syncHighlightsToCloud();
    setupHighlightSyncListener();

    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message || 'Sign up failed.' };
  }
}

// After signing in and pulling cloud data, merge any tags/highlights that existed
// locally before sign-in so they are not lost. Items are matched by ID —
// cloud-side entries win on conflict, purely local entries are appended.
async function mergePreSignInData(preSignInTags, preSignInHighlights) {
  // --- Tags ---
  if (preSignInTags.length > 0) {
    const cloudResult = await chrome.storage.local.get(['tags']);
    const cloudTags = cloudResult.tags || [];
    const cloudTagIds = new Set(cloudTags.map(t => t.id));
    const uniqueLocalTags = preSignInTags.filter(t => !cloudTagIds.has(t.id));
    if (uniqueLocalTags.length > 0) {
      await chrome.storage.local.set({ tags: [...cloudTags, ...uniqueLocalTags] });
      await syncTagsToCloud();
    }
  }

  // --- Highlights ---
  if (preSignInHighlights.length > 0) {
    const cloudResult = await chrome.storage.local.get(['highlights']);
    const cloudHighlights = cloudResult.highlights || [];
    const cloudIds = new Set(cloudHighlights.map(h => h.id));
    const uniqueLocal = preSignInHighlights.filter(h => !cloudIds.has(h.id));
    if (uniqueLocal.length > 0) {
      await chrome.storage.local.set({ highlights: [...cloudHighlights, ...uniqueLocal] });
      await syncHighlightsToCloud();
    }
  }
}

async function signIn(email, password) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    // Snapshot any data the user created locally before signing in.
    // We'll merge it into the cloud account after the cloud pull so nothing is lost.
    const localTagsResult = await chrome.storage.local.get(['tags']);
    const preSignInTags = localTagsResult.tags || [];
    const localHighlightsResult = await chrome.storage.local.get(['highlights']);
    const preSignInHighlights = localHighlightsResult.highlights || [];

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ? data.error.message : 'Sign in failed.' };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: true // Always sync tags
    };

    await storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    // Pull cloud data (overwrites local with account's data).
      await syncTagsFromCloud();
      setupTagSyncListener();
    await syncHighlightsFromCloud();
    setupHighlightSyncListener();

    // Merge any pre-signin local data into the now-synced state so it isn't lost.
    await mergePreSignInData(preSignInTags, preSignInHighlights);

    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message || 'Sign in failed.' };
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
  
  // Clear account data from local storage
  await chrome.storage.local.remove(['tags', 'highlights']);
  
  await chrome.storage.local.remove([AUTH_STORAGE_KEY]);
  setAuthState(null);
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

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(config.apiKey)}`, {
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
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ? data.error.message : 'Reset email failed.' };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'Reset email failed.' };
  }
}

async function loadUserSettings() {
  if (!currentUser) return;

  // Always sync tags when logged in, no need to check settings
  shareTags = true;
  currentUser.shareTags = true;
    await storeAuthState(currentUser);
    setAuthState(currentUser);
}

async function syncTagsToCloud() {
  if (!currentUser || !shareTags) return;
  const result = await chrome.storage.local.get(['tags']);
  const tags = result.tags || [];

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
    await chrome.storage.local.set({ tags });
    window.dispatchEvent(new CustomEvent('tagsSynced', { detail: { tags } }));
    return { success: true, tags };
  }
  return { success: true, tags: [] };
}

function setupTagSyncListener() {
  // Firestore REST doesn't support realtime listeners without SSE; use periodic sync.
  if (tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
  }
  tagSyncIntervalId = setInterval(() => {
    syncTagsFromCloud().catch(() => {});
  }, 60 * 1000);
}

async function syncHighlightsToCloud() {
  if (!currentUser) return;
  const result = await chrome.storage.local.get(['highlights']);
  const highlights = result.highlights || [];

  await firestorePatchDocument(`users/${encodeURIComponent(currentUser.uid)}/data/highlights`, {
    highlights: toFirestoreValue(highlights),
    updatedAt: toFirestoreValue(new Date().toISOString())
  });
}

async function syncHighlightsFromCloud() {
  if (!currentUser) return;
  const doc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/highlights`);
  if (doc && doc.fields && doc.fields.highlights) {
    const highlights = fromFirestoreValue(doc.fields.highlights) || [];
    await chrome.storage.local.set({ highlights });
    window.dispatchEvent(new CustomEvent('highlightsSynced', { detail: { highlights } }));
    return { success: true, highlights };
  }
  return { success: true, highlights: [] };
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

// Initialize on load.
initAuth();

window.authService = {
  signUp,
  signIn,
  signOut: signOutUser,
  deleteAccount,
  sendPasswordResetEmail,
  getCurrentUser,
  isSharingTags,
  syncTagsToCloud,
  syncTagsFromCloud,
  syncHighlightsToCloud,
  syncHighlightsFromCloud,
  initAuth
};
