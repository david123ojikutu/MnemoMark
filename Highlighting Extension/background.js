// Background service worker for the highlighting extension
importScripts('auth-config.js', 'auth-service.js');

// Track tabs to prevent forgetting them
let trackedTabs = new Set();

// Load tracked tabs from storage on startup
chrome.storage.local.get(['trackedTabs'], (result) => {
  if (result && result.trackedTabs && Array.isArray(result.trackedTabs)) {
    trackedTabs = new Set(result.trackedTabs);
  }
});

// Save tracked tabs to storage periodically
function saveTrackedTabs() {
  chrome.storage.local.set({ trackedTabs: Array.from(trackedTabs) });
}

// Save tracked tabs every 30 seconds
setInterval(saveTrackedTabs, 30000);

chrome.runtime.onInstalled.addListener(async () => {
  console.log('MnemoMark extension installed');
  
  // Initialize user settings on first install
  const settings = await chrome.storage.local.get(['highlightColor', 'settingsInitialized']);
  if (!settings.settingsInitialized) {
    await chrome.storage.local.set({
      highlightColor: '#4CAF50', // Green default
      settingsInitialized: true
    });
    console.log('User settings initialized');
  }
  
  // Create context menu item for selected text
  chrome.contextMenus.create({
    id: 'highlight-selected-text',
    title: 'Highlight selected text',
    contexts: ['selection']
  });
  
  // Track all existing tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        trackedTabs.add(tab.id);
      }
    });
    saveTrackedTabs();
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'highlight-selected-text' && info.selectionText) {
    // Send message to content script to show tag selection
    chrome.tabs.sendMessage(tab.id, {
      action: 'showHighlightDialog',
      selectedText: info.selectionText
    }).catch(err => {
      console.error('Error sending message to content script:', err);
      // If message fails, it might be because content script isn't loaded yet
      // Try injecting the script first
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        // Retry sending the message
        chrome.tabs.sendMessage(tab.id, {
          action: 'showHighlightDialog',
          selectedText: info.selectionText
        });
      }).catch(injectErr => {
        console.error('Error injecting script:', injectErr);
      });
    });
  }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveHighlight') {
    saveHighlight(request.data);
    sendResponse({ success: true });
  } else if (request.action === 'getHighlights') {
    getHighlights(request.url).then(highlights => {
      sendResponse({ highlights });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'deleteHighlight') {
    deleteHighlight(request.id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'updateHighlight') {
    updateHighlight(request.highlightId, request.tags, request.note, request.noteHtml).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  } else if (request.action === 'createTag') {
    createTag(request.name).then(tag => {
      sendResponse({ success: true, tag });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function saveHighlight(data) {
  const result = await chrome.storage.local.get(['highlights']);
  const highlights = result.highlights || [];
  highlights.push({
    id: data.id || Date.now().toString(),
    url: data.url,
    text: data.text,
    tags: data.tags || [],
    note: data.note || '',
    noteHtml: data.noteHtml || '',
    timestamp: Date.now(),
    xpath: data.xpath || '',
    isPdf: data.isPdf || false
  });
  await chrome.storage.local.set({ highlights });
  
  // Sync to cloud if logged in (auth runs in this worker via importScripts)
  if (globalThis.authService) {
    globalThis.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
}

async function getHighlights(url) {
  const result = await chrome.storage.local.get(['highlights']);
  const highlights = result.highlights || [];
  return highlights.filter(h => h.url === url);
}

async function deleteHighlight(id) {
  const result = await chrome.storage.local.get(['highlights']);
  const highlights = result.highlights || [];
  const filtered = highlights.filter(h => h.id !== id);
  await chrome.storage.local.set({ highlights: filtered });
  
  if (globalThis.authService) {
    globalThis.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
}

async function updateHighlight(highlightId, tags, note, noteHtml) {
  const result = await chrome.storage.local.get(['highlights']);
  const highlights = result.highlights || [];
  const highlightIndex = highlights.findIndex(h => h.id === highlightId);
  
  if (highlightIndex === -1) {
    throw new Error('Highlight not found');
  }
  
  highlights[highlightIndex].tags = tags || [];
  highlights[highlightIndex].note = note || '';
  highlights[highlightIndex].noteHtml = noteHtml || '';
  
  await chrome.storage.local.set({ highlights });
  
  if (globalThis.authService) {
    globalThis.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
}

async function createTag(name) {
  if (!name || !name.trim()) {
    throw new Error('Tag name is required');
  }
  
  const result = await chrome.storage.local.get(['tags']);
  const tags = result.tags || [];
  
  // Check for duplicate (case-insensitive)
  const existingTag = tags.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
  if (existingTag) {
    throw new Error('Tag already exists');
  }
  
  const newTag = {
    id: Date.now().toString(),
    name: name.trim(),
    color: '#ffeb3b', // Default yellow
    parentIds: [],
    timestamp: Date.now()
  };
  
  tags.push(newTag);
  await chrome.storage.local.set({ tags });
  
  return newTag;
}

// Track tabs when they're created or updated
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
    trackedTabs.add(tab.id);
    saveTrackedTabs();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track tab when URL changes (page navigation)
  if (changeInfo.url && !changeInfo.url.startsWith('chrome://') && !changeInfo.url.startsWith('chrome-extension://')) {
    trackedTabs.add(tabId);
    saveTrackedTabs();
    
    // Ensure content script is injected for tracked tabs
    if (changeInfo.status === 'complete' && tab.url) {
      ensureContentScript(tabId, tab.url);
    }
  }
  
  // When tab becomes complete, ensure content script is present
  if (changeInfo.status === 'complete' && tab.url && 
      !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
    trackedTabs.add(tabId);
    saveTrackedTabs();
    ensureContentScript(tabId, tab.url);
  }
});

// Track tabs when they're activated (switched to)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
      trackedTabs.add(activeInfo.tabId);
      saveTrackedTabs();
      // Ensure content script is present when tab is activated
      ensureContentScript(activeInfo.tabId, tab.url);
    }
  });
});

// Remove tab from tracking when closed
chrome.tabs.onRemoved.addListener((tabId) => {
  trackedTabs.delete(tabId);
  saveTrackedTabs();
});

// Ensure content script is injected in a tab
async function ensureContentScript(tabId, url) {
  // Skip chrome:// and extension pages
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }
  
  try {
    // Check if content script is already injected by trying to send a message
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (error) {
    // Content script not present, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // Also inject CSS
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content.css']
      });
    } catch (injectError) {
      // Tab might not be ready yet, or it's a special page
      console.debug('Could not inject content script:', injectError);
    }
  }
}

// Periodically check and ensure content scripts are present in tracked tabs
setInterval(() => {
  trackedTabs.forEach(tabId => {
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab && tab.url && 
          !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        ensureContentScript(tabId, tab.url);
      } else if (chrome.runtime.lastError) {
        // Tab no longer exists, remove from tracking
        trackedTabs.delete(tabId);
        saveTrackedTabs();
      }
    });
  });
}, 60000); // Check every minute

