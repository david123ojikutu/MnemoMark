// Content script for highlighting functionality

// Get selected text and its position
let selectedText = '';
let selectedRange = null;
let floatingButton = null;

// Helper function to recursively get all parent tags (including grandparents, etc.)
function getAllParentTags(tagId, allTags, visited = new Set()) {
  if (visited.has(tagId)) {
    return []; // Prevent infinite loops in case of circular references
  }
  visited.add(tagId);
  
  const tag = allTags.find(t => t.id === tagId);
  if (!tag || !tag.parentIds || tag.parentIds.length === 0) {
    return [];
  }
  
  const parentTags = [];
  tag.parentIds.forEach(parentId => {
    const parentTag = allTags.find(t => t.id === parentId);
    if (parentTag) {
      parentTags.push(parentTag.id);
      // Recursively get grandparents, etc.
      const grandparentTags = getAllParentTags(parentId, allTags, visited);
      parentTags.push(...grandparentTags);
    }
  });
  
  return parentTags;
}

// Helper function to expand tag IDs to include all parent tags
function expandTagsWithParents(tagIds, allTags) {
  if (!tagIds || tagIds.length === 0) {
    return [];
  }
  
  const expandedTagIds = new Set(tagIds);
  
  tagIds.forEach(tagId => {
    const parentTagIds = getAllParentTags(tagId, allTags);
    parentTagIds.forEach(parentId => expandedTagIds.add(parentId));
  });
  
  return Array.from(expandedTagIds);
}

// Detect if we're in Chrome's PDF viewer
function isPDFViewer() {
  // Check URL pattern for PDF (most reliable indicator)
  const url = window.location.href.toLowerCase();
  if (url.endsWith('.pdf') || url.includes('.pdf#') || url.includes('.pdf?') || 
      url.startsWith('chrome-extension://') && url.includes('pdf')) {
    return true;
  }
  
  // Check for Chrome PDF viewer embed
  const embed = document.querySelector('embed[type="application/pdf"]');
  if (embed) return true;
  
  // Check for object with PDF
  const object = document.querySelector('object[type="application/pdf"]');
  if (object) return true;
  
  // Check for PDF.js viewer elements (Chrome uses PDF.js internally)
  // The textLayer is the key indicator - it contains selectable text
  if (document.querySelector('.textLayer') || document.querySelector('.pdfViewer') || 
      document.querySelector('#viewer')) return true;
  
  // Check for PDF plugin container
  if (document.querySelector('#plugin')) return true;
  
  return false;
}

// Detect if we're in Internet Archive's PDF viewer (uses PDF.js with accessible textLayer)
function isInternetArchivePDF() {
  const url = window.location.href.toLowerCase();
  // Internet Archive PDF viewer URLs contain archive.org and usually have viewer in the path
  if (url.includes('archive.org') && (url.includes('/stream/') || url.includes('/details/') || document.querySelector('.textLayer'))) {
    // Double check that we have a textLayer which means PDF.js is accessible
    if (document.querySelector('.textLayer')) {
      return true;
    }
  }
  return false;
}

// Setup selection listeners for PDF viewer embed
function setupPDFViewerListeners() {
  // For PDF.js viewer (which Chrome uses), add listeners to textLayer elements
  const textLayers = document.querySelectorAll('.textLayer');
  textLayers.forEach(textLayer => {
    textLayer.addEventListener('mouseup', handleSelectionChange, true);
    textLayer.addEventListener('selectionchange', handleSelectionChange, true);
    textLayer.addEventListener('selectstart', handleSelectionChange, true);
  });
  
  // Also listen on the viewer container
  const viewer = document.querySelector('#viewer') || document.querySelector('.pdfViewer');
  if (viewer) {
    viewer.addEventListener('mouseup', handleSelectionChange, true);
    viewer.addEventListener('selectionchange', handleSelectionChange, true);
  }
  
  const embed = document.querySelector('embed[type="application/pdf"]');
  if (embed) {
    // Try to access embed's contentWindow if accessible
    try {
      if (embed.contentWindow && embed.contentWindow.document) {
        const embedDoc = embed.contentWindow.document;
        embedDoc.addEventListener('mouseup', handleSelectionChange, true);
        embedDoc.addEventListener('selectionchange', handleSelectionChange, true);
      }
    } catch (e) {
      // Cross-origin restriction - normal for PDF viewer
      console.debug('Cannot access embed content (expected):', e);
    }
  }
  
  // Also check all iframes (PDF viewer might use iframe)
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      if (iframe.contentDocument || iframe.contentWindow) {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          iframeDoc.addEventListener('mouseup', handleSelectionChange, true);
          iframeDoc.addEventListener('selectionchange', handleSelectionChange, true);
        }
      }
    } catch (e) {
      // Cross-origin - skip
    }
  });
}

// Create floating highlight button
function createFloatingButton() {
  if (floatingButton) {
    floatingButton.remove();
  }
  
  floatingButton = document.createElement('div');
  floatingButton.className = 'highlight-floating-btn';
  floatingButton.title = 'Click to highlight selected text';
  
  // Set background image using extension icon (using 48px icon for better quality when scaled)
  const iconUrl = chrome.runtime.getURL('icons/icon48.png');
  
  // Use background-image for better compatibility - ensure it fits within the circle
  floatingButton.style.backgroundImage = `url(${iconUrl})`;
  floatingButton.style.backgroundSize = '80%';
  floatingButton.style.backgroundPosition = 'center';
  floatingButton.style.backgroundRepeat = 'no-repeat';
  
  // Verify icon loads by creating a test image
  const testImg = new Image();
  testImg.onerror = () => {
    console.error('Icon failed to load:', iconUrl);
    // Only show fallback if icon truly fails
    floatingButton.style.backgroundImage = 'none';
    floatingButton.textContent = '★';
    floatingButton.style.color = '#4CAF50';
    floatingButton.style.fontSize = '20px';
  };
  testImg.src = iconUrl;
  
  document.body.appendChild(floatingButton);
  
  floatingButton.addEventListener('click', handleFloatingButtonClick);
  
  return floatingButton;
}

// Position floating button near selection
function positionFloatingButton() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0 || selection.toString().trim() === '') {
    hideFloatingButton();
    return;
  }

  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Check if selection is valid and visible
    if (rect.width === 0 && rect.height === 0) {
      // Try to get bounding rect from the range's container
      const container = range.commonAncestorContainer;
      if (container.nodeType === 3) { // Text node
        const parentRect = container.parentElement?.getBoundingClientRect();
        if (parentRect && parentRect.width > 0 && parentRect.height > 0) {
          // Use parent element's rect if available
          const rect2 = { 
            left: parentRect.left, 
            top: parentRect.top, 
            right: parentRect.right, 
            bottom: parentRect.bottom,
            width: parentRect.width,
            height: parentRect.height
          };
          positionButtonForRect(rect2);
          return;
        }
      }
      hideFloatingButton();
      return;
    }

    positionButtonForRect(rect);
  } catch (error) {
    console.error('Error positioning floating button:', error);
    hideFloatingButton();
  }
}

function positionButtonForRect(rect) {
  if (!floatingButton) {
    createFloatingButton();
  }

  // Ensure button is in the document body
  if (!document.body.contains(floatingButton)) {
    document.body.appendChild(floatingButton);
  }

  // Position button above the selection, slightly to the right
  const buttonSize = 32;
  const offset = 10;
  
  // Use getBoundingClientRect positioning relative to viewport
  const viewportLeft = rect.right + offset;
  const viewportTop = rect.top - buttonSize - offset;
  
  // Position relative to viewport (getBoundingClientRect is viewport-relative)
  floatingButton.style.position = 'fixed';
  floatingButton.style.left = viewportLeft + 'px';
  floatingButton.style.top = viewportTop + 'px';
  
  // Adjust if button would go off screen
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (viewportLeft + buttonSize > viewportWidth) {
    floatingButton.style.left = (rect.left - buttonSize - offset) + 'px';
  }
  
  if (viewportTop < 0) {
    floatingButton.style.top = (rect.bottom + offset) + 'px';
  }
  
  // Ensure button appears above everything
  floatingButton.style.display = 'flex';
}

// Hide floating button
function hideFloatingButton() {
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
}

// Handle floating button click
function handleFloatingButtonClick(e) {
  e.stopPropagation();
  e.preventDefault();
  
  const selection = window.getSelection();
  if (selection.rangeCount > 0 && selection.toString().trim()) {
    selectedRange = selection.getRangeAt(0).cloneRange();
    selectedText = selection.toString().trim();
    
    // Open extension popup or show tag selection
    // Since we can't directly open popup, we'll show a tag selection UI
    showTagSelectionUI();
  }
}

// Show tag selection UI (simplified inline version or open popup)
function showTagSelectionUI() {
  // Get tags from storage and show selection
  chrome.storage.local.get(['tags'], (result) => {
    const tags = result.tags || [];
    
    // Allow highlighting even without tags - tags are optional
    // Create a simple modal for tag selection
    showInlineTagSelection(tags);
  });
}

// Show inline tag selection modal
function showInlineTagSelection(tags) {
  // Remove existing modal if any
  const existingModal = document.getElementById('highlight-tag-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.id = 'highlight-tag-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    color: #333;
  `;
  
  content.innerHTML = `
    <h2 style="margin: 0 0 16px 0; font-size: 18px; font-family: inherit; font-weight: 600; color: inherit;">Select tags (optional):</h2>
    <div id="tag-checkboxes-container" style="margin-bottom: 16px; max-height: 300px; overflow-y: auto;"></div>
    ${tags.length === 0 ? '<p style="color: #666; font-size: 14px; margin-bottom: 16px; font-family: inherit;">No tags created yet. You can still highlight without tags.</p>' : ''}
    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 4px; font-size: 14px; color: #333; font-family: inherit;">Note (optional):</label>
      <textarea id="highlight-note-input" placeholder="Add a note to this highlight..." style="width: 100%; min-height: 60px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="cancel-highlight" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px;">Cancel</button>
      <button id="apply-highlight" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px;">Highlight</button>
    </div>
  `;
  
  const checkboxesContainer = content.querySelector('#tag-checkboxes-container');
  tags.forEach(tag => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px; font-family: inherit; font-size: 14px;';
    label.onmouseover = () => label.style.background = '#f5f5f5';
    label.onmouseout = () => label.style.background = 'transparent';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tag.id;
    
    const colorBox = document.createElement('span');
    colorBox.style.cssText = `width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;`;
    
    const name = document.createElement('span');
    name.textContent = tag.name;
    name.style.fontFamily = 'inherit';
    name.style.fontSize = '14px';
    
    label.appendChild(checkbox);
    label.appendChild(colorBox);
    label.appendChild(name);
    checkboxesContainer.appendChild(label);
  });
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Event listeners
  content.querySelector('#cancel-highlight').addEventListener('click', () => {
    modal.remove();
    hideFloatingButton();
  });
  
  content.querySelector('#apply-highlight').addEventListener('click', async () => {
    const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
    const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);
    
    // Get all tags to expand with parents
    const result = await chrome.storage.local.get(['tags']);
    const allTags = result.tags || [];
    
    // Automatically include all parent tags
    const expandedTagIds = expandTagsWithParents(selectedTagIds, allTags);
    const note = content.querySelector('#highlight-note-input')?.value.trim() || '';
    
    // Tags are optional - allow highlighting with empty tag array
    highlightText(null, expandedTagIds, note).then(() => {
      modal.remove();
      hideFloatingButton();
      
      // Clear selection
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        selection.removeAllRanges();
      }
    }).catch(err => {
      alert('Error highlighting text: ' + err.message);
    });
  });
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      hideFloatingButton();
    }
  });
}

// Track selection changes - use multiple events for better compatibility
let lastSelectionText = '';
let selectionTimeout = null;

function handleSelectionChange(event) {
  // Clear any pending timeout
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }
  
  selectionTimeout = setTimeout(() => {
    try {
      // For PDF viewer, try multiple selection contexts
      let selection = null;
      let selectionText = '';
      
      // Try main window selection first
      try {
        selection = window.getSelection();
        selectionText = selection.toString().trim();
      } catch (e) {
        // Fallback if window.getSelection() fails
      }
      
      // If no selection in main window and we're in a PDF, try document selection
      if ((!selection || selection.rangeCount === 0 || !selectionText) && isPDFViewer()) {
        try {
          selection = document.getSelection();
          if (selection) {
            selectionText = selection.toString().trim();
          }
        } catch (e) {
          console.debug('PDF selection fallback error:', e);
        }
      }
      
      // If still no selection and event came from a specific context, try that
      if ((!selection || selection.rangeCount === 0 || !selectionText) && event && event.target) {
        try {
          const targetDoc = event.target.ownerDocument || event.target.getRootNode();
          if (targetDoc && targetDoc.defaultView) {
            selection = targetDoc.defaultView.getSelection();
            if (selection) {
              selectionText = selection.toString().trim();
            }
          }
        } catch (e) {
          // Cross-origin or other restriction
        }
      }
      
      if (!selection || selection.rangeCount === 0 || !selectionText) {
        hideFloatingButton();
        return;
      }
      
      // Only update if selection actually changed and has content
      if (selectionText !== lastSelectionText && selectionText.length > 0) {
        lastSelectionText = selectionText;
        
        try {
          selectedRange = selection.getRangeAt(0).cloneRange();
          selectedText = selectionText;
          positionFloatingButton();
        } catch (error) {
          // Selection might be in a different frame or invalid
          console.debug('Selection error:', error);
          hideFloatingButton();
        }
      } else if (selectionText === '') {
        hideFloatingButton();
      }
    } catch (error) {
      console.debug('Selection change error:', error);
    }
  }, 50); // Small delay to ensure selection is fully set
}

// Poll for selection changes on PDF pages (more reliable than events)
let selectionPollInterval = null;
let isMouseDown = false;
let mouseMoveHandler = null;

// Store handlers so we can check if they're attached
let selectionPollingHandlers = {
  mouseDown: null,
  mouseUp: null
};

function startSelectionPolling() {
  // Clear existing interval if any (restart if needed)
  if (selectionPollInterval) {
    clearInterval(selectionPollInterval);
  }
  
  // Track mouse state for better selection detection
  const handleMouseDown = () => { 
    isMouseDown = true; 
    // Start aggressive checking while mouse is down
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler, true);
    }
    mouseMoveHandler = () => {
      if (isMouseDown) {
        checkSelectionDirect();
      }
    };
    document.addEventListener('mousemove', mouseMoveHandler, true);
  };
  
  const handleMouseUp = () => { 
    isMouseDown = false; 
    // Immediately check selection on mouseup
    setTimeout(() => checkSelectionDirect(), 150);
    // Stop aggressive mousemove checking
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler, true);
      mouseMoveHandler = null;
    }
  };
  
  // Remove old listeners if they exist
  if (selectionPollingHandlers.mouseDown) {
    document.removeEventListener('mousedown', selectionPollingHandlers.mouseDown, true);
  }
  if (selectionPollingHandlers.mouseUp) {
    document.removeEventListener('mouseup', selectionPollingHandlers.mouseUp, true);
  }
  
  // Store handlers
  selectionPollingHandlers.mouseDown = handleMouseDown;
  selectionPollingHandlers.mouseUp = handleMouseUp;
  
  // Attach listeners
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  
  // Continuous polling - check frequently
  // Use a slower interval for regular pages, faster for PDFs
  const interval = isPDFViewer() ? 100 : 200;
  selectionPollInterval = setInterval(() => {
    checkSelectionDirect();
  }, interval);
}

function checkSelectionDirect() {
  try {
    // For PDFs, try multiple methods to get selection
    let selection = null;
    let selectionText = '';
    
    if (isPDFViewer()) {
      // Try multiple selection methods for PDFs
      try {
        selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selectionText = selection.toString().trim();
        }
      } catch (e) {}
      
      // Also try document.getSelection as fallback
      if ((!selection || !selectionText) && document.getSelection) {
        try {
          selection = document.getSelection();
          if (selection && selection.rangeCount > 0) {
            selectionText = selection.toString().trim();
          }
        } catch (e) {}
      }
      
      // For PDFs, also check the textLayer directly
      if ((!selection || !selectionText)) {
        try {
          const textLayers = document.querySelectorAll('.textLayer');
          for (const textLayer of textLayers) {
            try {
              const layerSelection = textLayer.ownerDocument.defaultView?.getSelection();
              if (layerSelection && layerSelection.rangeCount > 0) {
                const layerText = layerSelection.toString().trim();
                if (layerText) {
                  selection = layerSelection;
                  selectionText = layerText;
                  break;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    } else {
      // For regular pages, use standard method
      selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selectionText = selection.toString().trim();
      }
    }
    
    if (!selection || selection.rangeCount === 0 || !selectionText) {
      if (lastSelectionText) {
        hideFloatingButton();
        lastSelectionText = '';
      }
      return;
    }
    
    // Only update if selection actually changed and has content
    if (selectionText !== lastSelectionText) {
      if (selectionText.length > 0) {
        try {
          const range = selection.getRangeAt(0);
          // Basic validation
          if (range && !range.collapsed) {
            selectedRange = range.cloneRange();
            selectedText = selectionText;
            lastSelectionText = selectionText;
            positionFloatingButton();
          } else {
            // Invalid range
            if (lastSelectionText) {
              hideFloatingButton();
              lastSelectionText = '';
            }
          }
        } catch (error) {
          // Range might be invalid, hide button
          if (lastSelectionText) {
            hideFloatingButton();
            lastSelectionText = '';
          }
        }
      } else {
        // No valid selection text
        if (lastSelectionText) {
          hideFloatingButton();
          lastSelectionText = '';
        }
      }
    }
  } catch (e) {
    // Silently handle errors
  }
}

function stopSelectionPolling() {
  if (selectionPollInterval) {
    clearInterval(selectionPollInterval);
    selectionPollInterval = null;
  }
}

// Watch for dynamically added textLayer elements (PDF.js loads them asynchronously)
let textLayerObserver = null;
function setupTextLayerObserver() {
  if (textLayerObserver) return; // Already observing
  
  textLayerObserver = new MutationObserver((mutations) => {
    let shouldSetup = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the added node is a textLayer or contains one
          if (node.classList?.contains('textLayer') || node.querySelector?.('.textLayer')) {
            shouldSetup = true;
          }
        }
      });
    });
    
    if (shouldSetup) {
      setupPDFViewerListeners();
      if (!selectionPollInterval && isPDFViewer()) {
        startSelectionPolling();
      }
    }
  });
  
  textLayerObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
}

// Initialize PDF viewer listeners if needed
// Always check if we're on a PDF page (check can happen after page load)
function initializePDFSupport() {
  const isPDF = isPDFViewer();
  
  if (isPDF) {
    // Set up observer to watch for dynamically added textLayer elements
    setupTextLayerObserver();
    
    // Always start polling for PDFs - this is the most reliable method
    startSelectionPolling();
    
    // Also try to set up event listeners
    setupPDFViewerListeners();
    
    // Set up listeners again after delays to catch dynamically loaded content
    setTimeout(() => {
      setupPDFViewerListeners();
      if (!selectionPollInterval) {
        startSelectionPolling();
      }
    }, 1000);
    
    setTimeout(() => {
      setupPDFViewerListeners();
      if (!selectionPollInterval) {
        startSelectionPolling();
      }
    }, 3000);
  }
}

// Show PDF helper UI - since floating button doesn't work on PDFs
function showPDFHelperUI() {
  // Check if we already showed it
  if (document.getElementById('mnemomark-pdf-helper')) {
    return;
  }

  const helper = document.createElement('div');
  helper.id = 'mnemomark-pdf-helper';
  helper.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2147483646;
    max-width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
  `;

  helper.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 12px;">
      <strong style="color: #4CAF50; font-size: 16px;">MnemoMark</strong>
      <button id="mnemomark-pdf-helper-close" style="margin-left: auto; background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
    </div>
    <p style="margin: 0 0 12px 0; color: #333; line-height: 1.5;">
      To highlight text in PDFs:<br>
      <strong>1.</strong> Select text<br>
      <strong>2.</strong> Right-click → "Highlight selected text"
    </p>
    <button id="mnemomark-pdf-manual-highlight" style="width: 100%; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
      Add Highlight Manually
    </button>
  `;

  document.body.appendChild(helper);

  // Close button
  helper.querySelector('#mnemomark-pdf-helper-close').addEventListener('click', () => {
    helper.remove();
    // Don't save preference - user wants to see it every time they load a PDF
  });

  // Manual highlight button
  helper.querySelector('#mnemomark-pdf-manual-highlight').addEventListener('click', () => {
    helper.remove();
    // Show a dialog to manually add highlight
    showManualHighlightDialog();
  });

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (helper.parentNode) {
      helper.style.opacity = '0';
      helper.style.transition = 'opacity 0.3s';
      setTimeout(() => helper.remove(), 300);
    }
  }, 10000);
}

// Show dialog for manually adding highlights to PDFs
function showManualHighlightDialog() {
  chrome.storage.local.get(['tags'], (result) => {
    const tags = result.tags || [];
    
    // Create a simple prompt or use the existing tag selection UI
    const note = prompt('Enter a note or description for this highlight:');
    if (note !== null) {
      // Create a highlight entry for the current PDF URL
      const highlightData = {
        url: window.location.href,
        text: note || 'Manual highlight',
        tags: [],
        note: note,
        timestamp: Date.now(),
        xpath: '',
        isPdf: true
      };

      chrome.runtime.sendMessage({
        action: 'saveHighlight',
        data: highlightData
      });

      // Show success message
      const success = document.createElement('div');
      success.textContent = 'Highlight saved!';
      success.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #4CAF50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      document.body.appendChild(success);
      setTimeout(() => success.remove(), 2000);
    }
  });
}

// Initialize - wait for page to be ready
function waitForPDFViewer() {
  // Always start polling for all pages - this ensures consistent behavior
  // Polling works for both PDFs and regular pages
  startSelectionPolling();
  
  // Additional setup for PDFs
  if (isPDFViewer()) {
    // Always show helper when PDF loads (user wants to see it every time)
    // Wait a bit for PDF to load, then show helper
    setTimeout(() => showPDFHelperUI(), 2000);
    
    initializePDFSupport();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForPDFViewer);
} else {
  waitForPDFViewer();
}

// Re-initialize on page navigation (for SPAs and dynamic content)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Re-initialize after a short delay to allow page to settle
    setTimeout(() => {
      waitForPDFViewer();
    }, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Also listen for popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  setTimeout(() => {
    waitForPDFViewer();
  }, 500);
});

// Ensure polling and listeners are always active - reinitialize periodically
// This handles cases where content script context might be lost/recreated
let initializationCheckInterval = setInterval(() => {
  // Always ensure polling is active (works for both PDFs and regular pages)
  if (!selectionPollInterval) {
    startSelectionPolling();
  }
  
  // For PDFs, also ensure PDF-specific listeners are set up
  if (isPDFViewer()) {
    setupPDFViewerListeners();
    if (!textLayerObserver) {
      setupTextLayerObserver();
    }
  }
}, 10000); // Check every 10 seconds to ensure everything stays active

// Listen to multiple events for maximum compatibility
document.addEventListener('mouseup', handleSelectionChange, true);
document.addEventListener('selectionchange', handleSelectionChange, true);
// Also listen on keyup for keyboard selections (Shift+Arrow keys, etc.)
document.addEventListener('keyup', (e) => {
  if (e.shiftKey || e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
      e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    handleSelectionChange(e);
  }
}, true);

// For PDF viewer, also listen to copy events (users often copy selected text)
document.addEventListener('copy', (e) => {
  if (isPDFViewer()) {
    handleSelectionChange(e);
  }
}, true);

// Hide button when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (floatingButton && !floatingButton.contains(e.target)) {
    // Don't hide immediately, let mouseup handle it
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection.rangeCount === 0 || selection.toString().trim() === '') {
        hideFloatingButton();
      }
    }, 100);
  }
});

// Right-click handler for existing highlights
document.addEventListener('contextmenu', (e) => {
  // Check if right-clicked element is a highlight or inside a highlight
  const highlightElement = e.target.closest('.web-highlight');
  if (highlightElement) {
    e.preventDefault(); // Prevent default context menu
    const highlightId = highlightElement.dataset.highlightId;
    if (highlightId) {
      showHighlightEditPopup(highlightElement, highlightId);
    }
  }
}, true);

// Listen for messages from popup and background (context menu)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Respond to ping to confirm content script is loaded
  if (request.action === 'ping') {
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'showHighlightDialog') {
    // Context menu was clicked - use the selectedText provided by Chrome
    // This works even for PDFs where window.getSelection() might not work
    if (request.selectedText && request.selectedText.trim()) {
      selectedText = request.selectedText.trim();
      
      // Try to get the selection range if possible (works on regular pages, not PDFs)
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selectedRange = selection.getRangeAt(0).cloneRange();
        } else {
          selectedRange = null; // Will use selectedText directly for highlighting
        }
      } catch (e) {
        selectedRange = null; // PDF or other case where range isn't accessible
      }
      
      // Get tags and show selection UI
      chrome.storage.local.get(['tags'], (result) => {
        const tags = result.tags || [];
        showInlineTagSelection(tags);
      });
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getSelection') {
    // Try multiple methods to get selection (important for PDF viewer)
    let selection = null;
    let selectionText = '';
    
    try {
      selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selectionText = selection.toString().trim();
        if (selectionText) {
          selectedRange = selection.getRangeAt(0).cloneRange();
          selectedText = selectionText;
          sendResponse({ text: selectedText });
          return true;
        }
      }
    } catch (e) {
      // Fallback
    }
    
    // Try document.getSelection as fallback
    try {
      selection = document.getSelection();
      if (selection && selection.rangeCount > 0) {
        selectionText = selection.toString().trim();
        if (selectionText) {
          selectedRange = selection.getRangeAt(0).cloneRange();
          selectedText = selectionText;
          sendResponse({ text: selectedText });
          return true;
        }
      }
    } catch (e) {
      // Fallback failed
    }
    
    sendResponse({ text: null });
    return true;
  } else if (request.action === 'highlightText') {
    highlightText(request.selection, request.tags, request.note || '').then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  } else if (request.action === 'loadHighlights') {
    loadHighlights();
    sendResponse({ success: true });
  } else if (request.action === 'removeHighlight') {
    removeHighlight(request.id);
    sendResponse({ success: true });
  }
});

async function highlightText(selectionText, tags, note = '') {
  // For PDFs, try to add visual highlighting if possible
  if (isPDFViewer()) {
    if (!selectedText) {
      throw new Error('No text selected');
    }
    
    const isArchive = isInternetArchivePDF();
    let savedXPath = '';
    let highlightSpan = null;
    
    // Try to add visual highlight to PDF textLayer if accessible (especially for Internet Archive)
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range && !range.collapsed) {
          // Try to wrap selected text in PDF.js textLayer
          try {
            const textLayers = document.querySelectorAll('.textLayer');
            for (const textLayer of textLayers) {
              try {
                const layerSelection = textLayer.ownerDocument.defaultView?.getSelection() || window.getSelection();
                if (layerSelection && layerSelection.rangeCount > 0) {
                  const layerRange = layerSelection.getRangeAt(0);
                  if (layerRange && !layerRange.collapsed && layerRange.toString().trim() === selectedText.trim()) {
                    // Found matching range in textLayer, try to highlight it
                    const span = document.createElement('span');
                    span.className = 'web-highlight';
                    const highlightColor = await getHighlightColor();
                    span.style.backgroundColor = highlightColor;
                    span.style.color = 'inherit';
                    span.style.padding = '1px 2px';
                    span.style.borderRadius = '2px';
                    span.style.cursor = 'pointer';
                    
                    try {
                      // Try to surround the range
                      const contents = layerRange.extractContents();
                      span.appendChild(contents);
                      layerRange.insertNode(span);
                      highlightSpan = span;
                      // Save XPath for Internet Archive PDFs so we can restore later
                      if (isArchive) {
                        savedXPath = getXPath(span);
                      }
                    } catch (e) {
                      // If that fails, try surroundContents
                      try {
                        layerRange.surroundContents(span);
                        highlightSpan = span;
                        if (isArchive) {
                          savedXPath = getXPath(span);
                        }
                      } catch (e2) {
                        // If both fail, just save without visual highlight
                        console.debug('Could not visually highlight PDF text:', e2);
                      }
                    }
                    break;
                  }
                }
              } catch (e) {}
            }
          } catch (e) {
            console.debug('Could not access PDF textLayer for highlighting:', e);
          }
        }
      }
    } catch (e) {
      console.debug('PDF highlighting attempt failed:', e);
    }
    
    // Save highlight for PDF
    // For Internet Archive, save XPath so we can restore highlights
    const pdfHighlightId = 'highlight-' + Date.now();
    chrome.runtime.sendMessage({
      action: 'saveHighlight',
      data: {
        id: pdfHighlightId,
        url: window.location.href,
        text: selectedText,
        tags: tags || [],
        note: note || '',
        xpath: savedXPath, // Save XPath for Internet Archive PDFs
        isPdf: !isArchive, // Only mark as PDF if NOT Internet Archive (since we can restore Archive PDFs)
        isArchivePdf: isArchive // Mark Internet Archive PDFs separately
      }
    });
    
    // Store highlight ID on the span if we created one
    if (highlightSpan) {
      highlightSpan.dataset.highlightId = pdfHighlightId;
      highlightSpan.dataset.tags = JSON.stringify(tags || []);
    }
    
    selectedRange = null;
    selectedText = '';
    
    // Clear selection after highlighting
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    return;
  }
  
  // For regular web pages, do the normal highlighting
  // Get current selection if available
  const selection = window.getSelection();
  if (selection.rangeCount === 0) {
    if (!selectedRange) {
      throw new Error('No text selected');
    }
  } else {
    selectedRange = selection.getRangeAt(0).cloneRange();
    selectedText = selection.toString().trim();
  }

  if (!selectedRange || !selectedText) {
    throw new Error('No text selected');
  }
  
  const highlightId = 'highlight-' + Date.now();
  
  // Get highlight color (green default, customizable later)
  const highlightColor = await getHighlightColor();
  
  // Create a continuous highlight using overlay rectangles
  // This ensures formatting doesn't break the highlight appearance
  highlightWithOverlay(selectedRange, highlightId, highlightColor, selectedText, tags, note);
  
  // Clear selection
  if (selection) {
    selection.removeAllRanges();
  }
  
  selectedRange = null;
  selectedText = '';
}

// Highlight text by wrapping the entire selection in a single span outside formatting elements
// This creates a continuous highlight that spans across bold/italic/strike formatting
function highlightWithOverlay(range, highlightId, highlightColor, text, tags, note) {
  // Strategy: Wrap the entire selected fragment in a single span
  // The span will be placed at the highest level needed to contain all the selection
  // This ensures the background is continuous across formatting boundaries
  
  try {
    // Clone the range to avoid modifying the original
    const clonedRange = range.cloneRange();
    
    // Try to extract and wrap the entire contents
    const contents = clonedRange.extractContents();
    
    // Create the highlight wrapper span
    const highlightWrapper = document.createElement('span');
    highlightWrapper.className = 'web-highlight';
    highlightWrapper.dataset.highlightId = highlightId;
    highlightWrapper.dataset.tags = JSON.stringify(tags || []);
    highlightWrapper.style.backgroundColor = highlightColor;
    highlightWrapper.style.cursor = 'pointer';
    
    // Put the extracted contents into the wrapper
    highlightWrapper.appendChild(contents);
    
    // Insert the wrapper at the original range position
    clonedRange.insertNode(highlightWrapper);
    
    // Apply background color to all descendants to ensure formatting elements also get colored
    const allDescendants = highlightWrapper.querySelectorAll('*');
    allDescendants.forEach(child => {
      // Only apply if it's a formatting element (preserve other styling)
      const tagName = child.tagName;
      if (['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'MARK', 'CODE', 'SUB', 'SUP'].includes(tagName)) {
        child.style.backgroundColor = highlightColor;
      }
    });
    
    // Add click handler for editing
    highlightWrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showHighlightEditPopup(highlightWrapper, highlightId);
    });
    
    // Save highlight
    chrome.runtime.sendMessage({
      action: 'saveHighlight',
      data: {
        id: highlightId,
        url: window.location.href,
        text: text,
        tags: tags || [],
        note: note || '',
        xpath: getXPath(highlightWrapper)
      }
    });
    
  } catch (e) {
    // If extractContents fails (crosses formatting boundaries), use fallback method
    console.debug('extractContents failed, using fallback:', e);
    
    // Fallback: Use overlay rectangles positioned via getClientRects()
    highlightWithRectOverlays(range, highlightId, highlightColor, text, tags, note);
  }
}

// Fallback method: Use absolutely positioned overlay rectangles
function highlightWithRectOverlays(range, highlightId, highlightColor, text, tags, note) {
  // Get all rectangle positions for the selection (one per line/segment)
  const rects = range.getClientRects();
  
  if (!rects || rects.length === 0) {
    throw new Error('No selection rectangles found');
  }
  
  // Create a container to hold all overlay rectangles
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'web-highlight-overlay-container';
  overlayContainer.dataset.highlightId = highlightId;
  overlayContainer.dataset.tags = JSON.stringify(tags || []);
  overlayContainer.style.position = 'absolute';
  overlayContainer.style.top = '0';
  overlayContainer.style.left = '0';
  overlayContainer.style.width = '100%';
  overlayContainer.style.height = '100%';
  overlayContainer.style.pointerEvents = 'none';
  overlayContainer.style.zIndex = '9999';
  
  // Get scroll position
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;
  
  // Create marker span for tracking (invisible, placed at start of selection)
  let markerSpan = null;
  try {
    const textNodes = getTextNodesInRange(range);
    if (textNodes.length > 0) {
      markerSpan = document.createElement('span');
      markerSpan.className = 'web-highlight-marker';
      markerSpan.dataset.highlightId = highlightId;
      markerSpan.style.display = 'none';
      markerSpan.style.position = 'absolute';
      markerSpan.style.width = '0';
      markerSpan.style.height = '0';
      
      const firstNode = textNodes[0].textNode;
      const firstParent = firstNode.parentNode;
      firstParent.insertBefore(markerSpan, firstNode);
    }
  } catch (e) {
    console.debug('Could not create marker span:', e);
  }
  
  // Create overlay rectangles for each line segment
  Array.from(rects).forEach((rect) => {
    const overlay = document.createElement('div');
    overlay.className = 'web-highlight-overlay';
    overlay.dataset.highlightId = highlightId;
    overlay.style.position = 'absolute';
    overlay.style.backgroundColor = highlightColor;
    overlay.style.cursor = 'pointer';
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '0.3';
    overlay.style.mixBlendMode = 'multiply';
    
    // Position relative to document, accounting for scroll
    overlay.style.left = (rect.left + scrollX) + 'px';
    overlay.style.top = (rect.top + scrollY) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    
    // Add click handler for editing
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      showHighlightEditPopupByID(highlightId);
    });
    
    overlayContainer.appendChild(overlay);
  });
  
  // Append overlay container to body
  document.body.appendChild(overlayContainer);
  
  // Update overlay positions on scroll/resize
  const updateOverlayPositions = () => {
    try {
      // Try to find the original range position using marker
      if (!markerSpan || !markerSpan.parentNode) return;
      
      // Reconstruct range from marker
      const newRange = document.createRange();
      try {
        newRange.setStartBefore(markerSpan);
        // Find end by searching for text length
        const walker = document.createTreeWalker(
          markerSpan.parentNode,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let foundStart = false;
        let charsRemaining = text.length;
        let endNode = null;
        let endOffset = 0;
        
        let node;
        while (node = walker.nextNode()) {
          if (node === markerSpan.nextSibling || (foundStart && node.textContent)) {
            foundStart = true;
            if (node.textContent) {
              if (charsRemaining <= node.textContent.length) {
                endNode = node;
                endOffset = charsRemaining;
                break;
              }
              charsRemaining -= node.textContent.length;
            }
          }
        }
        
        if (endNode) {
          newRange.setEnd(endNode, endOffset);
        } else {
          newRange.setEndAfter(markerSpan);
        }
        
        const newRects = newRange.getClientRects();
        if (newRects && newRects.length > 0) {
          const overlays = overlayContainer.querySelectorAll('.web-highlight-overlay');
          const newScrollX = window.pageXOffset || document.documentElement.scrollLeft;
          const newScrollY = window.pageYOffset || document.documentElement.scrollTop;
          
          Array.from(newRects).forEach((rect, index) => {
            if (overlays[index]) {
              overlays[index].style.left = (rect.left + newScrollX) + 'px';
              overlays[index].style.top = (rect.top + newScrollY) + 'px';
              overlays[index].style.width = rect.width + 'px';
              overlays[index].style.height = rect.height + 'px';
            }
          });
        }
      } catch (e) {
        console.debug('Error updating overlay positions:', e);
      }
    } catch (e) {
      console.debug('Error in updateOverlayPositions:', e);
    }
  };
  
  overlayContainer._updatePositions = updateOverlayPositions;
  window.addEventListener('scroll', updateOverlayPositions, { passive: true });
  window.addEventListener('resize', updateOverlayPositions, { passive: true });
  
  // Save highlight
  chrome.runtime.sendMessage({
    action: 'saveHighlight',
    data: {
      id: highlightId,
      url: window.location.href,
      text: text,
      tags: tags || [],
      note: note || '',
      xpath: markerSpan ? getXPath(markerSpan) : '',
      useOverlay: true
    }
  });
}

// Helper function to show edit popup by highlight ID
function showHighlightEditPopupByID(highlightId) {
  // Try to find highlight element
  const highlightElement = document.querySelector(`[data-highlight-id="${highlightId}"]`);
  if (highlightElement) {
    showHighlightEditPopup(highlightElement, highlightId);
    return;
  }
  
  // If not found, try marker span
  const markerSpan = document.querySelector(`[data-highlight-id="${highlightId}"].web-highlight-marker`);
  if (markerSpan) {
    // Create a dummy element for the popup
    const dummyElement = document.createElement('span');
    dummyElement.dataset.highlightId = highlightId;
    showHighlightEditPopup(dummyElement, highlightId);
  }
}

// Get all text nodes that are within or intersect with the given range
// Returns array of { textNode, startOffset, endOffset }
function getTextNodesInRange(range) {
  const textNodes = [];
  
  // Get the container for the range
  const container = range.commonAncestorContainer;
  const containerElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
  
  // Create a tree walker to find all text nodes
  const walker = document.createTreeWalker(
    containerElement || document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    // Skip if already highlighted
    if (node.parentElement && node.parentElement.classList.contains('web-highlight')) {
      continue;
    }
    
    // Check if this text node intersects with the range
    try {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      
      // Check intersection
      const startComparison = range.compareBoundaryPoints(Range.START_TO_START, nodeRange);
      const endComparison = range.compareBoundaryPoints(Range.END_TO_END, nodeRange);
      const startToEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange);
      const endToStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange);
      
      let startOffset = 0;
      let endOffset = node.textContent.length;
      
      // Determine offsets if range partially intersects
      if (range.startContainer === node) {
        startOffset = range.startOffset;
      }
      if (range.endContainer === node) {
        endOffset = range.endOffset;
      }
      
      // If node is fully within range
      if (startComparison <= 0 && endComparison >= 0) {
        textNodes.push({ textNode: node, startOffset: 0, endOffset: node.textContent.length });
      }
      // If range starts before node and ends within or after node
      else if (startToEnd > 0 && endToStart <= 0) {
        textNodes.push({ textNode: node, startOffset: startOffset, endOffset: endOffset });
      }
      // If range starts within node and ends after node
      else if (startComparison <= 0 && endToStart > 0) {
        textNodes.push({ textNode: node, startOffset: startOffset, endOffset: endOffset });
      }
      // If range is fully within node
      else if (startToEnd > 0 && endToStart < 0) {
        textNodes.push({ textNode: node, startOffset: startOffset, endOffset: endOffset });
      }
    } catch (e) {
      // If range comparison fails, try a simpler approach
      // Check if the text node's text appears in the selected text
      if (text && node.textContent && text.includes(node.textContent.trim().substring(0, Math.min(20, node.textContent.length)))) {
        textNodes.push({ textNode: node, startOffset: 0, endOffset: node.textContent.length });
      }
    }
  }
  
  return textNodes;
}

// Restore highlight from XPath
function restoreHighlightFromXPath(highlight) {
  // For Internet Archive PDFs, we can restore highlights even if isPdf is true
  // because they use accessible PDF.js textLayer
  if (!highlight.xpath && !highlight.isArchivePdf) {
    if (highlight.isPdf) {
      return; // Can't restore standard PDF highlights without XPath
    }
    // For regular pages without XPath, try text search
    restoreHighlightByText(highlight);
    return;
  }
  
  // For Internet Archive PDFs, try to restore using XPath or text search
  if (highlight.isArchivePdf || (highlight.isPdf && isInternetArchivePDF())) {
    // Wait for textLayer to be ready, then restore
    waitForPDFTextLayer(() => {
      if (highlight.xpath) {
        tryRestoreArchiveHighlight(highlight);
      } else {
        restoreHighlightByText(highlight);
      }
    });
    return;
  }
  
  // Check if already highlighted
  const existingHighlight = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
  if (existingHighlight) {
    // Already exists, just update style
    getHighlightColor().then(color => {
      existingHighlight.style.backgroundColor = color;
    });
    return;
  }
  
  try {
    const result = document.evaluate(
      highlight.xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    
    const element = result.singleNodeValue;
    if (!element) {
      // XPath not found, try text search
      restoreHighlightByText(highlight);
      return;
    }
    
    // Check if element is already inside a highlight
    if (element.closest && element.closest('.web-highlight')) {
      return; // Already highlighted
    }
    
    if (element.nodeType === Node.TEXT_NODE) {
      // If it's a text node, wrap it
      const span = document.createElement('span');
      span.className = 'web-highlight';
      span.dataset.highlightId = highlight.id;
      span.dataset.tags = JSON.stringify(highlight.tags || []);
      
      const highlightColor = '#4CAF50';
      getHighlightColor().then(color => {
        span.style.backgroundColor = color;
        span.style.cursor = 'pointer';
      }).catch(() => {
        span.style.backgroundColor = highlightColor;
        span.style.cursor = 'pointer';
      });
      
      // For PDFs, add padding for visibility
      if (isPDFViewer()) {
        span.style.padding = '1px 2px';
        span.style.borderRadius = '2px';
      }
      
      const parent = element.parentNode;
      if (parent) {
        parent.replaceChild(span, element);
        span.appendChild(element);
      }
    } else if (element.nodeType === Node.ELEMENT_NODE) {
      // If it's already an element, just update its style
      element.className = 'web-highlight';
      element.dataset.highlightId = highlight.id;
      element.dataset.tags = JSON.stringify(highlight.tags || []);
      
      const highlightColor = '#4CAF50';
      getHighlightColor().then(color => {
        element.style.backgroundColor = color;
        element.style.cursor = 'pointer';
      }).catch(() => {
        element.style.backgroundColor = highlightColor;
        element.style.cursor = 'pointer';
      });
      
      // For PDFs, ensure padding is applied
      if (isPDFViewer()) {
        if (!element.style.padding) {
          element.style.padding = '1px 2px';
        }
        if (!element.style.borderRadius) {
          element.style.borderRadius = '2px';
        }
      }
    }
  } catch (e) {
    // XPath might be invalid if page structure changed - try to find by text content
    console.debug('Could not restore highlight from XPath, trying text search:', e);
    restoreHighlightByText(highlight);
  }
}

// Fallback: try to restore highlight by searching for text
function restoreHighlightByText(highlight) {
  if (!highlight.text) return;
  
  // Check if already highlighted
  const existingHighlight = document.querySelector(`[data-highlight-id="${highlight.id}"]`);
  if (existingHighlight) {
    // Ensure color is applied
    getHighlightColor().then(color => {
      existingHighlight.style.backgroundColor = color;
    });
    return; // Already exists
  }
  
  const searchText = highlight.text.trim().substring(0, 50);
  if (!searchText) return;
  
  // For Internet Archive PDFs, search in textLayer specifically
  let searchRoot = document.body;
  if (isInternetArchivePDF()) {
    const textLayers = document.querySelectorAll('.textLayer');
    if (textLayers.length > 0) {
      // Search in all textLayers
      textLayers.forEach(textLayer => {
        searchInElement(textLayer, highlight, searchText);
      });
      return;
    }
  }
  
  // For regular pages, search in body
  searchInElement(searchRoot, highlight, searchText);
}

// Helper function to search and highlight text in a specific element
function searchInElement(rootElement, highlight, searchText) {
  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    // Check if already highlighted
    if (node.parentElement && node.parentElement.classList.contains('web-highlight')) {
      continue; // Already highlighted
    }
    
    const nodeText = node.textContent;
    if (nodeText.includes(searchText)) {
      // Found potential match - try to match more precisely
      const fullText = highlight.text.trim();
      const nodeFullText = nodeText.trim();
      
      // Try to find a better match
      let startIndex = nodeFullText.indexOf(fullText);
      if (startIndex === -1) {
        startIndex = nodeFullText.indexOf(searchText);
      }
      if (startIndex === -1) continue;
      
      // Try to highlight this text
      const range = document.createRange();
      const endIndex = Math.min(startIndex + fullText.length, nodeText.length);
      
      try {
        range.setStart(node, startIndex);
        range.setEnd(node, endIndex);
        
        // Check if range is valid
        if (range.collapsed) continue;
        
        const span = document.createElement('span');
        span.className = 'web-highlight';
        span.dataset.highlightId = highlight.id;
        span.dataset.tags = JSON.stringify(highlight.tags || []);
        
        const highlightColor = '#4CAF50'; // Default green
        getHighlightColor().then(color => {
          span.style.backgroundColor = color;
          span.style.cursor = 'pointer';
        }).catch(() => {
          span.style.backgroundColor = highlightColor;
          span.style.cursor = 'pointer';
        });
        
        // For PDFs, add some padding for visibility
        if (isPDFViewer()) {
          span.style.padding = '1px 2px';
          span.style.borderRadius = '2px';
        }
        
        try {
          range.surroundContents(span);
          return; // Found and highlighted, stop searching
        } catch (e) {
          // Try extractContents method
          try {
            const contents = range.extractContents();
            span.appendChild(contents);
            range.insertNode(span);
            return;
          } catch (e2) {
            // Couldn't highlight this range, continue searching
            continue;
          }
        }
      } catch (e) {
        // Couldn't highlight this range, continue searching
        continue;
      }
    }
  }
}

// Wait for PDF textLayer to be ready (for Internet Archive)
function waitForPDFTextLayer(callback, maxAttempts = 50, attempt = 0) {
  if (document.querySelector('.textLayer') && document.querySelector('.textLayer').children.length > 0) {
    callback();
    return;
  }
  
  if (attempt >= maxAttempts) {
    // Fallback: try anyway after timeout
    setTimeout(callback, 1000);
    return;
  }
  
  setTimeout(() => {
    waitForPDFTextLayer(callback, maxAttempts, attempt + 1);
  }, 100);
}

// Try to restore highlight for Internet Archive PDF
function tryRestoreArchiveHighlight(highlight) {
  try {
    const result = document.evaluate(
      highlight.xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    
    const element = result.singleNodeValue;
    if (element) {
      // Check if already highlighted
      if (element.closest && element.closest('.web-highlight')) {
        return;
      }
      
      // Update style to ensure highlight color is applied
      getHighlightColor().then(color => {
        if (element.style) {
          element.style.backgroundColor = color;
        }
      });
      return;
    }
  } catch (e) {
    console.debug('Could not restore Archive PDF highlight from XPath:', e);
  }
  
  // Fallback to text search
  restoreHighlightByText(highlight);
}

function loadHighlights() {
  // Wait a bit for page to be fully loaded
  // For Internet Archive PDFs, wait longer for textLayer
  const waitTime = isInternetArchivePDF() ? 500 : 100;
  
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'getHighlights',
      url: window.location.href
    }, (response) => {
      if (response && response.highlights) {
        response.highlights.forEach(highlight => {
          // Remove existing highlights to avoid duplicates
          document.querySelectorAll(`[data-highlight-id="${highlight.id}"]`).forEach(el => {
            el.remove();
          });
          
          // Restore highlight from XPath
          restoreHighlightFromXPath(highlight);
        });
      }
    });
  }, waitTime);
}

function removeHighlight(id) {
  const highlight = document.querySelector(`[data-highlight-id="${id}"]`);
  if (highlight) {
    const parent = highlight.parentNode;
    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
    parent.normalize();
  }
}

// Get highlight color (green default, customizable later)
async function getHighlightColor() {
  try {
    const result = await chrome.storage.local.get(['highlightColor']);
    return result.highlightColor || '#4CAF50'; // Green default
  } catch (e) {
    return '#4CAF50'; // Green default
  }
}

// Helper function to highlight complex ranges that cross element boundaries (bold, italic, etc.)
function highlightComplexRange(range, spanTemplate, highlightId, text, tags, note) {
  // Get the common ancestor container
  const container = range.commonAncestorContainer;
  const containerElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
  
  // Get all text nodes in the range
  const walker = document.createTreeWalker(
    containerElement || document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    // Check if this text node intersects with our range
    try {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      
      // Check if node is fully or partially within the range
      if (range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
          range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0) {
        textNodes.push(node);
      } else if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0 &&
                 range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0) {
        // Partial intersection - add it
        textNodes.push(node);
      }
    } catch (e) {
      // If range comparison fails, check by text content
      if (node.textContent && text.includes(node.textContent.trim().substring(0, 20))) {
        textNodes.push(node);
      }
    }
  }
  
  if (textNodes.length === 0) {
    throw new Error('No text nodes found in range');
  }
  
  // Wrap each text node that needs highlighting
  let firstHighlightSpan = null;
  textNodes.forEach(textNode => {
    // Skip if already highlighted
    if (textNode.parentElement && textNode.parentElement.classList.contains('web-highlight')) {
      return;
    }
    
    const parent = textNode.parentNode;
    const formattingTags = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'MARK', 'CODE', 'SUB', 'SUP'];
    
    // Create a new span for this highlight
    const highlightSpan = spanTemplate.cloneNode(true);
    highlightSpan.dataset.highlightId = highlightId;
    highlightSpan.dataset.tags = JSON.stringify(tags || []);
    // Ensure color is applied
    getHighlightColor().then(color => {
      highlightSpan.style.backgroundColor = color;
      // Also apply to all children (formatting elements)
      const allChildren = highlightSpan.querySelectorAll('*');
      allChildren.forEach(child => {
        child.style.backgroundColor = color;
      });
    }).catch(() => {
      highlightSpan.style.backgroundColor = '#4CAF50';
    });
    
    if (!firstHighlightSpan) {
      firstHighlightSpan = highlightSpan;
    }
    
    // If parent is a formatting element, wrap it
    if (parent && formattingTags.includes(parent.tagName)) {
      try {
        parent.parentNode.insertBefore(highlightSpan, parent);
        highlightSpan.appendChild(parent);
        // Apply color to the formatting element
        parent.style.backgroundColor = highlightSpan.style.backgroundColor || '#4CAF50';
      } catch (e) {
        // If that fails, try wrapping just the text node
        try {
          parent.insertBefore(highlightSpan, textNode);
          highlightSpan.appendChild(textNode);
        } catch (e2) {
          // Skip this node if we can't wrap it
          console.debug('Could not wrap text node:', e2);
        }
      }
    } else {
      // Wrap just the text node
      try {
        parent.insertBefore(highlightSpan, textNode);
        highlightSpan.appendChild(textNode);
      } catch (e) {
        console.debug('Could not wrap text node:', e);
      }
    }
  });
  
  // Save highlight (only once, using first span's XPath)
  if (firstHighlightSpan) {
    chrome.runtime.sendMessage({
      action: 'saveHighlight',
      data: {
        id: highlightId,
        url: window.location.href,
        text: text,
        tags: tags || [],
        note: note || '',
        xpath: getXPath(firstHighlightSpan)
      }
    });
  }
}

function getXPath(element) {
  if (element.id !== '') {
    return '//*[@id="' + element.id + '"]';
  }
  if (element === document.body) {
    return '/html/body';
  }
  let ix = 0;
  const siblings = element.parentNode.childNodes;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

// Show popup for editing existing highlight
async function showHighlightEditPopup(highlightElement, highlightId) {
  // Remove existing modal if any
  const existingModal = document.getElementById('highlight-edit-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
    // Get highlight data from storage
    chrome.runtime.sendMessage({
      action: 'getHighlights',
      url: window.location.href
    }, async (response) => {
      if (!response || !response.highlights) return;
      
      // Try to find highlight by ID (might be 'highlight-123' or just '123')
      let highlight = response.highlights.find(h => h.id === highlightId);
      if (!highlight) {
        // Try without 'highlight-' prefix
        const idWithoutPrefix = highlightId.replace(/^highlight-/, '');
        highlight = response.highlights.find(h => h.id === idWithoutPrefix || h.id === highlightId);
      }
      if (!highlight) return;
    
    // Get all tags
    const result = await chrome.storage.local.get(['tags']);
    const allTags = result.tags || [];
    
    const modal = document.createElement('div');
    modal.id = 'highlight-edit-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      color: #333;
    `;
    
    const currentTagIds = highlight.tags || [];
    const currentNote = highlight.note || '';
    
    content.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 18px; font-family: inherit; font-weight: 600; color: inherit;">Edit Highlight</h2>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-family: inherit; font-weight: 500;">Search Tags:</label>
        <input type="text" id="tag-search-input" placeholder="Search tags to add..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; font-size: 14px; box-sizing: border-box;">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-family: inherit; font-weight: 500;">Current Tags:</label>
        <div id="current-tags-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; min-height: 30px;"></div>
        <div id="available-tags-container" style="max-height: 200px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px; padding: 8px; display: none;"></div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <button id="create-new-tag-btn" style="padding: 8px 16px; border: 1px solid #4CAF50; background: white; color: #4CAF50; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px; width: 100%;">+ Create New Tag</button>
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #333; font-family: inherit; font-weight: 500;">Note:</label>
        <textarea id="highlight-note-edit" placeholder="Add or edit note..." style="width: 100%; min-height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; font-size: 14px; resize: vertical; box-sizing: border-box;">${escapeHtml(currentNote)}</textarea>
      </div>
      
      <div style="display: flex; gap: 8px; justify-content: space-between;">
        <button id="delete-edit-highlight" style="padding: 8px 16px; border: none; background: #f44336; color: white; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px;">Delete Highlight</button>
        <div style="display: flex; gap: 8px;">
          <button id="cancel-edit-highlight" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px;">Cancel</button>
          <button id="save-edit-highlight" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 14px;">Save</button>
        </div>
      </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Render current tags
    const currentTagsContainer = content.querySelector('#current-tags-container');
    const availableTagsContainer = content.querySelector('#available-tags-container');
    const tagSearchInput = content.querySelector('#tag-search-input');
    let selectedTagIds = [...currentTagIds];
    
    function renderCurrentTags() {
      currentTagsContainer.innerHTML = '';
      if (selectedTagIds.length === 0) {
        currentTagsContainer.innerHTML = '<span style="color: #999; font-size: 13px;">No tags</span>';
        return;
      }
      
      selectedTagIds.forEach(tagId => {
        const tag = allTags.find(t => t.id === tagId);
        if (!tag) return;
        
        const tagChip = document.createElement('div');
        tagChip.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background-color: ${tag.color}20;
          color: ${tag.color};
          border: 1px solid ${tag.color}40;
          border-radius: 16px;
          font-size: 13px;
          font-family: inherit;
        `;
        
        tagChip.innerHTML = `
          <span>${escapeHtml(tag.name)}</span>
          <button class="remove-tag-btn" data-tag-id="${tag.id}" style="background: none; border: none; color: ${tag.color}; cursor: pointer; font-size: 16px; padding: 0; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">×</button>
        `;
        
        tagChip.querySelector('.remove-tag-btn').addEventListener('click', () => {
          selectedTagIds = selectedTagIds.filter(id => id !== tagId);
          renderCurrentTags();
          renderAvailableTags();
        });
        
        currentTagsContainer.appendChild(tagChip);
      });
    }
    
    function renderAvailableTags(searchTerm = '') {
      const searchLower = searchTerm.toLowerCase();
      const availableTags = allTags.filter(tag => 
        !selectedTagIds.includes(tag.id) &&
        (searchTerm === '' || tag.name.toLowerCase().includes(searchLower))
      );
      
      if (searchTerm === '' || availableTags.length === 0) {
        availableTagsContainer.style.display = 'none';
        return;
      }
      
      availableTagsContainer.style.display = 'block';
      availableTagsContainer.innerHTML = '';
      
      availableTags.forEach(tag => {
        const tagOption = document.createElement('div');
        tagOption.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          cursor: pointer;
          border-radius: 4px;
          font-family: inherit;
          font-size: 14px;
        `;
        tagOption.onmouseover = () => tagOption.style.background = '#f5f5f5';
        tagOption.onmouseout = () => tagOption.style.background = 'transparent';
        
        const colorBox = document.createElement('span');
        colorBox.style.cssText = `width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;`;
        
        const name = document.createElement('span');
        name.textContent = tag.name;
        name.style.fontFamily = 'inherit';
        name.style.fontSize = '14px';
        
        tagOption.appendChild(colorBox);
        tagOption.appendChild(name);
        
        tagOption.addEventListener('click', async () => {
          if (!selectedTagIds.includes(tag.id)) {
            selectedTagIds.push(tag.id);
            
            // Automatically include all parent tags
            const parentTagIds = getAllParentTags(tag.id, allTags);
            parentTagIds.forEach(parentId => {
              if (!selectedTagIds.includes(parentId)) {
                selectedTagIds.push(parentId);
              }
            });
            
            renderCurrentTags();
            renderAvailableTags(tagSearchInput.value);
            tagSearchInput.value = '';
          }
        });
        
        availableTagsContainer.appendChild(tagOption);
      });
    }
    
    // Search functionality
    tagSearchInput.addEventListener('input', (e) => {
      renderAvailableTags(e.target.value);
    });
    
    // Create new tag button
    content.querySelector('#create-new-tag-btn').addEventListener('click', () => {
      const tagName = prompt('Enter tag name:');
      if (tagName && tagName.trim()) {
        // Create tag via message to background
        chrome.runtime.sendMessage({
          action: 'createTag',
          name: tagName.trim()
        }, (response) => {
          if (response && response.success) {
            // Reload tags and re-render
            chrome.storage.local.get(['tags'], (result) => {
              allTags.length = 0;
              allTags.push(...(result.tags || []));
              const newTag = allTags.find(t => t.name === tagName.trim());
              if (newTag && !selectedTagIds.includes(newTag.id)) {
                selectedTagIds.push(newTag.id);
                
                // Automatically include all parent tags
                const parentTagIds = getAllParentTags(newTag.id, allTags);
                parentTagIds.forEach(parentId => {
                  if (!selectedTagIds.includes(parentId)) {
                    selectedTagIds.push(parentId);
                  }
                });
              }
              renderCurrentTags();
              renderAvailableTags(tagSearchInput.value);
            });
          }
        });
      }
    });
    
    // Save button
    content.querySelector('#save-edit-highlight').addEventListener('click', async () => {
      const note = content.querySelector('#highlight-note-edit')?.value.trim() || '';
      
      // Automatically include all parent tags for all selected tags
      const expandedTagIds = expandTagsWithParents(selectedTagIds, allTags);
      
      // Update highlight in storage - use the actual highlight ID from storage
      const actualHighlightId = highlight.id;
      chrome.runtime.sendMessage({
        action: 'updateHighlight',
        highlightId: actualHighlightId,
        tags: expandedTagIds,
        note: note
      }, (response) => {
        if (response && response.success) {
          // Update the highlight element's tags (color stays green)
          getHighlightColor().then(color => {
            highlightElement.style.backgroundColor = color;
            highlightElement.dataset.tags = JSON.stringify(expandedTagIds);
          });
          
          modal.remove();
        } else {
          alert('Error updating highlight: ' + (response?.error || 'Unknown error'));
        }
      });
    });
    
    // Cancel button
    content.querySelector('#cancel-edit-highlight').addEventListener('click', () => {
      modal.remove();
    });
    
    // Delete button
    content.querySelector('#delete-edit-highlight').addEventListener('click', () => {
      if (!confirm('Are you sure you want to delete this highlight?')) {
        return;
      }
      
      const actualHighlightId = highlight.id;
      
      // Delete from storage
      chrome.runtime.sendMessage({
        action: 'deleteHighlight',
        id: actualHighlightId
      }, (response) => {
        if (response && response.success) {
          // Remove from page
          if (highlightElement) {
            const parent = highlightElement.parentNode;
            parent.replaceChild(document.createTextNode(highlightElement.textContent), highlightElement);
            parent.normalize();
          }
          
          modal.remove();
        } else {
          alert('Error deleting highlight');
        }
      });
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Initial render
    renderCurrentTags();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load highlights when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHighlights);
} else {
  loadHighlights();
}

