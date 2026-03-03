// Homepage script for displaying all tags and highlights

let tags = [];
let allHighlights = [];
let currentEditingTagId = null;
let currentEditingHighlightId = null;
let selectedHighlightIds = new Set();

function getAllParentTags(tagId, tagsList, visited = new Set()) {
  if (visited.has(tagId)) return [];
  visited.add(tagId);
  const tag = tagsList.find(t => t.id === tagId);
  if (!tag || !tag.parentIds || tag.parentIds.length === 0) return [];
  const parentTags = [];
  tag.parentIds.forEach(parentId => {
    const parentTag = tagsList.find(t => t.id === parentId);
    if (parentTag) {
      parentTags.push(parentTag.id);
      parentTags.push(...getAllParentTags(parentId, tagsList, visited));
    }
  });
  return parentTags;
}

function expandTagsWithParents(tagIds, tagsList) {
  if (!tagIds || tagIds.length === 0) return [];
  const expandedTagIds = new Set(tagIds);
  tagIds.forEach(tagId => {
    const parentTagIds = getAllParentTags(tagId, tagsList);
    parentTagIds.forEach(parentId => expandedTagIds.add(parentId));
  });
  return Array.from(expandedTagIds);
}

// Initialize homepage
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  setupEventListeners();
  setupTabs();
});

function setupEventListeners() {
  // Tag creation/editing (reusing popup.js functions)
  document.getElementById('createTagBtn').addEventListener('click', () => {
    openTagModal();
  });

  document.getElementById('closeModal').addEventListener('click', closeTagModal);
  document.getElementById('cancelTagBtn').addEventListener('click', closeTagModal);
  document.getElementById('saveTagBtn').addEventListener('click', saveTag);
  document.getElementById('deleteTagBtn').addEventListener('click', deleteTag);
  document.getElementById('parentTags').addEventListener('change', updateCurrentParents);
  document.getElementById('childTags').addEventListener('change', updateCurrentChildren);

  // Search and filter
  document.getElementById('searchHighlights').addEventListener('input', filterHighlights);
  document.getElementById('filterTag').addEventListener('change', filterHighlights);
  const selectAllHighlightsBtn = document.getElementById('selectAllHighlightsBtn');
  if (selectAllHighlightsBtn) {
    selectAllHighlightsBtn.addEventListener('click', toggleHighlightSelectionPanel);
  }
  const highlightSelectionCriteria = document.getElementById('highlightSelectionCriteria');
  const highlightSelectionTag = document.getElementById('highlightSelectionTag');
  const highlightSelectionText = document.getElementById('highlightSelectionText');
  const applyHighlightSelectionBtn = document.getElementById('applyHighlightSelectionBtn');
  const clearHighlightSelectionBtn = document.getElementById('clearHighlightSelectionBtn');
  const deleteSelectedHighlightsBtn = document.getElementById('deleteSelectedHighlightsBtn');
  const addTagToSelectedHighlightsBtn = document.getElementById('addTagToSelectedHighlightsBtn');
  const copySelectedHighlightsBtn = document.getElementById('copySelectedHighlightsBtn');
  if (highlightSelectionCriteria) {
    highlightSelectionCriteria.addEventListener('change', handleHighlightSelectionCriteriaChange);
  }
  if (applyHighlightSelectionBtn) {
    applyHighlightSelectionBtn.addEventListener('click', applyHighlightSelection);
  }
  if (clearHighlightSelectionBtn) {
    clearHighlightSelectionBtn.addEventListener('click', clearHighlightSelection);
  }
  if (deleteSelectedHighlightsBtn) {
    deleteSelectedHighlightsBtn.addEventListener('click', deleteSelectedHighlights);
  }
  if (addTagToSelectedHighlightsBtn) {
    addTagToSelectedHighlightsBtn.addEventListener('click', addTagToSelectedHighlights);
  }
  if (copySelectedHighlightsBtn) {
    copySelectedHighlightsBtn.addEventListener('click', copySelectedHighlights);
  }
  
  // Search tags
  const searchTagsInput = document.getElementById('searchTagsInput');
  if (searchTagsInput) {
    searchTagsInput.addEventListener('input', filterTags);
  }

  // Tag selection
  document.getElementById('selectTagsBtn').addEventListener('click', toggleTagSelectionPanel);
  document.getElementById('selectionCriteria').addEventListener('change', handleSelectionCriteriaChange);
  document.getElementById('applySelectionBtn').addEventListener('click', applyTagSelection);
  document.getElementById('clearSelectionBtn').addEventListener('click', clearTagSelection);
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedTags);
  document.getElementById('makeChildrenBtn').addEventListener('click', showMakeChildrenModal);

  // Close modal when clicking outside
  document.getElementById('tagModal').addEventListener('click', (e) => {
    if (e.target.id === 'tagModal') {
      closeTagModal();
    }
  });
}

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // Update buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content
      tabContents.forEach(c => c.classList.remove('active'));
      document.getElementById(targetTab + 'Tab').classList.add('active');
    });
  });
}

// Load all data
async function loadAllData() {
  await loadTags();
  await loadAllHighlights();
  updateStats();
  populateTagFilter();
  populateHighlightSelectionTag();
}

// Listen for highlights synced from cloud
window.addEventListener('highlightsSynced', (event) => {
  if (event.detail && event.detail.highlights) {
    loadAllHighlights();
  }
});

// Load tags (reusing from popup.js but need to ensure it's available)
async function loadTags() {
  // If user is logged in and sharing tags, sync from cloud first
  if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
    await window.authService.syncTagsFromCloud();
  }

  const result = await chrome.storage.local.get(['tags']);
  tags = result.tags || [];
  renderTags();
}

// Save tags
async function saveTags() {
  await chrome.storage.local.set({ tags });
  // Sync to cloud if user is logged in and sharing tags
  if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
    await window.authService.syncTagsToCloud();
  }

  // Also trigger update in popup.js if it exists
  if (typeof window.renderTags === 'function') {
    window.renderTags();
  }
}

// Load all highlights from all pages
async function loadAllHighlights() {
  // If user is logged in, sync from cloud first
  if (window.authService && window.authService.getCurrentUser()) {
    await window.authService.syncHighlightsFromCloud();
  }
  
  const result = await chrome.storage.local.get(['highlights']);
  allHighlights = result.highlights || [];
  renderHighlights();
}

// Update statistics
function updateStats() {
  document.getElementById('totalTags').textContent = tags.length;
  document.getElementById('totalHighlights').textContent = allHighlights.length;
  
  const uniquePages = new Set(allHighlights.map(h => h.url));
  document.getElementById('totalPages').textContent = uniquePages.size;
}

// Filter tags by search
function filterTags() {
  const searchInput = document.getElementById('searchTagsInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  if (!searchTerm) {
    renderTags();
    return;
  }
  
  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(searchTerm)
  );
  
  renderTags(filteredTags);
}

// Render tags list
function renderTags(tagsToRender = null) {
  const tagsList = document.getElementById('tagsList');
  tagsList.innerHTML = '';
  
  const tagsToShow = tagsToRender !== null ? tagsToRender : tags;

  if (tagsToShow.length === 0) {
    const searchInput = document.getElementById('searchTagsInput');
    const hasSearch = searchInput && searchInput.value.trim();
    tagsList.innerHTML = `<div class="empty-state">${hasSearch ? 'No tags found matching your search.' : 'No tags created yet. Click "Create New Tag" to get started.'}</div>`;
    return;
  }

  tagsToShow.forEach(tag => {
    const tagItem = document.createElement('div');
    tagItem.className = 'tag-item';
    tagItem.dataset.tagId = tag.id;

    const parents = getTagParents(tag.id);
    const parentNames = parents.map(p => p.name);

    tagItem.innerHTML = `
      <div class="tag-info">
        <input type="checkbox" class="tag-checkbox" data-tag-id="${tag.id}" style="margin-right: 8px; cursor: pointer;">
        <div class="tag-color" style="background-color: ${tag.color}"></div>
        <div class="tag-details">
          <div class="tag-name">${escapeHtml(tag.name)}</div>
          ${parentNames.length > 0 ? `
            <div class="tag-parents">
              Parents: ${parentNames.map(name => `<span>${escapeHtml(name)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="tag-actions">
        <button class="btn btn-primary btn-small btn-edit-tag" data-tag-id="${tag.id}">Edit</button>
      </div>
    `;

    // Add event listener for edit button
    const editBtn = tagItem.querySelector('.btn-edit-tag');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTag(tag.id);
      });
    }

    // Add event listener for checkbox
    const checkbox = tagItem.querySelector('.tag-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        tagItem.classList.toggle('tag-selected', checkbox.checked);
        updateSelectedTagsCount();
      });
      // Show checkbox if selection panel is visible
      const selectionPanel = document.getElementById('tagSelectionPanel');
      if (selectionPanel && selectionPanel.style.display !== 'none') {
        checkbox.style.display = 'block';
      }
    }

    tagsList.appendChild(tagItem);
  });
}

// Get parent tags for a given tag
function getTagParents(tagId) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag || !tag.parentIds || tag.parentIds.length === 0) {
    return [];
  }
  return tags.filter(t => tag.parentIds.includes(t.id));
}

// Render highlights list
function renderHighlights(filteredHighlights = null) {
  const highlightsList = document.getElementById('highlightsList');
  highlightsList.innerHTML = '';

  const highlightsToShow = filteredHighlights || allHighlights;

  if (highlightsToShow.length === 0) {
    highlightsList.innerHTML = '<div class="empty-state">No highlights found.</div>';
    return;
  }

  highlightsToShow.forEach(highlight => {
    const highlightItem = document.createElement('div');
    highlightItem.className = 'highlight-item';
    highlightItem.dataset.highlightId = highlight.id;

    const tagNames = highlight.tags && highlight.tags.length > 0
      ? highlight.tags.map(tagId => {
          const tag = tags.find(t => t.id === tagId);
          return tag ? tag : null;
        }).filter(Boolean)
      : [];

    // Don't truncate URL - let it wrap
    const urlDisplay = highlight.url;

    const tagButtonLabel = highlight.tags && highlight.tags.length > 0 ? 'Edit Tags' : '+ Add Tag';
    highlightItem.innerHTML = `
      <div class="highlight-top">
        <input type="checkbox" class="highlight-checkbox" data-highlight-id="${highlight.id}" style="cursor: pointer;">
        <div class="highlight-text">
          ${escapeHtml(highlight.text)}
        </div>
      </div>
      ${highlight.note ? `<div class="highlight-note">
        <strong>Note:</strong> ${escapeHtml(highlight.note)}
        <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn-edit-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Edit Note</button>
          <button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">${tagButtonLabel}</button>
        </div>
      </div>` : `<div style="margin: 8px 0; display: flex; gap: 6px; flex-wrap: wrap;"><button class="btn-add-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #f0f0f0; color: #666; border: 1px solid #ddd; border-radius: 3px; cursor: pointer;">+ Add Note</button><button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">${tagButtonLabel}</button></div>`}
      <div class="highlight-meta">
        <div class="highlight-tags">
          ${tagNames.length > 0 
            ? tagNames.map(tag => 
                `<span class="tag-badge" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">${escapeHtml(tag.name)}</span>`
              ).join('')
            : '<span class="tag-badge">No tags</span>'
          }
        </div>
        <a href="${highlight.url}" target="_blank" class="highlight-url" title="${highlight.url}">
          ${escapeHtml(urlDisplay)}
        </a>
      </div>
      <div class="highlight-actions" style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="btn-delete-highlight" data-highlight-id="${highlight.id}" style="padding: 6px 12px; font-size: 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
      </div>
    `;

    highlightsList.appendChild(highlightItem);
    
    // Add event listeners for note buttons
    const addNoteBtn = highlightItem.querySelector('.btn-add-note');
    const editNoteBtn = highlightItem.querySelector('.btn-edit-note');
    const deleteBtn = highlightItem.querySelector('.btn-delete-highlight');
    const addTagBtn = highlightItem.querySelector('.btn-add-tag');
    const checkbox = highlightItem.querySelector('.highlight-checkbox');
    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', () => editHighlightNote(highlight.id));
    }
    if (editNoteBtn) {
      editNoteBtn.addEventListener('click', () => editHighlightNote(highlight.id, highlight.note));
    }
    if (addTagBtn) {
      addTagBtn.addEventListener('click', () => addTagToHighlight(highlight.id));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteHighlight(highlight.id));
    }
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedHighlightIds.add(highlight.id);
        } else {
          selectedHighlightIds.delete(highlight.id);
        }
        highlightItem.classList.toggle('highlight-selected', e.target.checked);
        updateSelectedHighlightsCount();
      });
      const selectionPanel = document.getElementById('highlightSelectionPanel');
      if (selectionPanel && selectionPanel.style.display !== 'none') {
        checkbox.style.display = 'block';
      }
      if (selectedHighlightIds.has(highlight.id)) {
        checkbox.checked = true;
        highlightItem.classList.add('highlight-selected');
      }
    }
  });
}

// Delete highlight function
async function deleteHighlight(highlightId) {
  if (!confirm('Are you sure you want to delete this highlight?')) {
    return;
  }
  
  // Remove from local array
  allHighlights = allHighlights.filter(h => h.id !== highlightId);
  selectedHighlightIds.delete(highlightId);
  
  // Save to storage
  await saveAllHighlights();
  
  // Remove from background storage
  chrome.runtime.sendMessage({
    action: 'deleteHighlight',
    id: highlightId
  });
  
  // Reload highlights list
  renderHighlights();
  updateSelectedHighlightsCount();
  updateStats();
}

// Filter highlights
function filterHighlights() {
  const searchText = document.getElementById('searchHighlights').value.toLowerCase();
  const selectedTagId = document.getElementById('filterTag').value;

  let filtered = allHighlights;

  // Filter by tag
  if (selectedTagId) {
    filtered = filtered.filter(h => h.tags && h.tags.includes(selectedTagId));
  }

  // Filter by search text
  if (searchText) {
    filtered = filtered.filter(h => 
      h.text.toLowerCase().includes(searchText) ||
      h.url.toLowerCase().includes(searchText)
    );
  }

  renderHighlights(filtered);
}

function toggleHighlightSelectionPanel() {
  const panel = document.getElementById('highlightSelectionPanel');
  const selectBtn = document.getElementById('selectAllHighlightsBtn');
  if (!panel || !selectBtn) return;

  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';

  const checkboxes = document.querySelectorAll('.highlight-checkbox');
  checkboxes.forEach(cb => {
    cb.style.display = isVisible ? 'none' : 'block';
    if (isVisible) {
      cb.checked = false;
      const item = cb.closest('.highlight-item');
      if (item) item.classList.remove('highlight-selected');
    }
  });

  if (isVisible) {
    selectedHighlightIds.clear();
    updateSelectedHighlightsCount();
    selectBtn.textContent = 'Select All Highlights';
    selectBtn.classList.remove('btn-danger');
    selectBtn.classList.add('btn-secondary');
  } else {
    updateSelectedHighlightsCount();
    selectBtn.textContent = 'Cancel Selection';
    selectBtn.classList.remove('btn-secondary');
    selectBtn.classList.add('btn-danger');
    applyHighlightSelection();
  }
}

function handleHighlightSelectionCriteriaChange() {
  const criteria = document.getElementById('highlightSelectionCriteria').value;
  const tagSelect = document.getElementById('highlightSelectionTag');
  const textInput = document.getElementById('highlightSelectionText');

  if (tagSelect) tagSelect.style.display = 'none';
  if (textInput) textInput.style.display = 'none';

  if (criteria === 'tag' && tagSelect) {
    tagSelect.style.display = 'inline-block';
    populateHighlightSelectionTag();
  } else if (criteria === 'text' && textInput) {
    textInput.style.display = 'inline-block';
  }
}

function applyHighlightSelection() {
  const criteria = document.getElementById('highlightSelectionCriteria').value;
  const tagSelect = document.getElementById('highlightSelectionTag');
  const textInput = document.getElementById('highlightSelectionText');
  const checkboxes = document.querySelectorAll('.highlight-checkbox');

  selectedHighlightIds.clear();

  const textTerm = textInput ? textInput.value.toLowerCase().trim() : '';
  const selectedTagId = tagSelect ? tagSelect.value : '';

   if (criteria === 'tag' && !selectedTagId) {
     alert('Please select a tag to use for selection.');
     return;
   }
   if (criteria === 'text' && !textTerm) {
     alert('Please enter text to search within highlights.');
     return;
   }

  checkboxes.forEach(cb => {
    const highlightId = cb.dataset.highlightId;
    const highlight = allHighlights.find(h => h.id === highlightId);
    let match = false;

    switch (criteria) {
      case 'all':
        match = true;
        break;
      case 'tag':
        match = highlight && highlight.tags && highlight.tags.includes(selectedTagId);
        break;
      case 'text':
        if (highlight) {
          const noteText = (highlight.note || '').toLowerCase();
          match = highlight.text.toLowerCase().includes(textTerm) || noteText.includes(textTerm) || highlight.url.toLowerCase().includes(textTerm);
        }
        break;
    }

    cb.checked = !!match;
    cb.style.display = 'block';
    const item = cb.closest('.highlight-item');
    if (item) {
      item.classList.toggle('highlight-selected', !!match);
    }
    if (match && highlightId) {
      selectedHighlightIds.add(highlightId);
    }
  });

  updateSelectedHighlightsCount();
}

function clearHighlightSelection() {
  selectedHighlightIds.clear();
  const checkboxes = document.querySelectorAll('.highlight-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
    const item = cb.closest('.highlight-item');
    if (item) item.classList.remove('highlight-selected');
  });
  updateSelectedHighlightsCount();
}

function updateSelectedHighlightsCount() {
  const countSpan = document.getElementById('selectedHighlightsCount');
  const actionsDiv = document.getElementById('highlightSelectionActions');
  const count = selectedHighlightIds.size;

  if (countSpan) {
    countSpan.textContent = `${count} highlight${count !== 1 ? 's' : ''} selected`;
  }

  if (actionsDiv) {
    actionsDiv.style.display = count > 0 ? 'flex' : 'none';
  }
}

async function deleteSelectedHighlights() {
  const selectedIds = Array.from(selectedHighlightIds);
  if (selectedIds.length === 0) {
    alert('No highlights selected.');
    return;
  }

  if (!confirm(`Delete ${selectedIds.length} selected highlight(s)?`)) {
    return;
  }

  allHighlights = allHighlights.filter(h => !selectedIds.includes(h.id));
  await saveAllHighlights();

  selectedIds.forEach(id => {
    chrome.runtime.sendMessage({
      action: 'deleteHighlight',
      id
    });
  });

  selectedHighlightIds.clear();
  filterHighlights();
  updateStats();
  clearHighlightSelection();
}

async function addTagToSelectedHighlights() {
  const selectedIds = Array.from(selectedHighlightIds);
  if (selectedIds.length === 0) {
    alert('No highlights selected.');
    return;
  }

  const allTags = tags || [];
  if (allTags.length === 0) {
    alert('No tags available. Please create a tag first.');
    return;
  }

  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
  modal.id = 'bulkAddTagModal';

  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 24px; border-radius: 8px; max-width: 420px; width: 90%; max-height: 80vh; overflow-y: auto;';

  let tagCheckboxes = '';
  allTags.forEach(tag => {
    tagCheckboxes += `
      <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
        <input type="checkbox" value="${tag.id}">
        <span style="width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;"></span>
        <span>${escapeHtml(tag.name)}</span>
      </label>
    `;
  });

  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0;">Add Tags to ${selectedIds.length} Highlight${selectedIds.length !== 1 ? 's' : ''}</h3>
    <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
      ${tagCheckboxes}
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="cancelBulkAddTag" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="saveBulkAddTag" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 4px; cursor: pointer;">Add Tags</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  content.querySelector('#cancelBulkAddTag').addEventListener('click', () => modal.remove());
  content.querySelector('#saveBulkAddTag').addEventListener('click', async () => {
    const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
    const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedTagIds.length === 0) {
      alert('Please select at least one tag.');
      return;
    }

    const expandedTagIds = expandTagsWithParents(selectedTagIds, allTags);

    selectedIds.forEach(highlightId => {
      const highlight = allHighlights.find(h => h.id === highlightId);
      if (highlight) {
        const newTags = new Set(highlight.tags || []);
        expandedTagIds.forEach(tid => newTags.add(tid));
        highlight.tags = Array.from(newTags);

        chrome.runtime.sendMessage({
          action: 'updateHighlight',
          highlightId: highlight.id,
          tags: highlight.tags,
          note: highlight.note || ''
        });
      }
    });

    await saveAllHighlights();
    modal.remove();
    filterHighlights();
    updateStats();
    updateSelectedHighlightsCount();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function copySelectedHighlights() {
  let idsToCopy = Array.from(selectedHighlightIds);
  if (idsToCopy.length === 0) {
    const visibleItems = document.querySelectorAll('.highlight-item');
    idsToCopy = Array.from(visibleItems).map(item => item.dataset.highlightId);
  }

  if (idsToCopy.length === 0) {
    alert('No highlights to copy.');
    return;
  }

  const lines = idsToCopy.map(id => {
    const h = allHighlights.find(x => x.id === id);
    if (!h) return '';
    const tagNames = (h.tags || []).map(tagId => {
      const tag = tags.find(t => t.id === tagId);
      return tag ? tag.name : null;
    }).filter(Boolean);
    const noteLine = h.note ? `Note: ${h.note}` : '';
    const tagsLine = tagNames.length ? `Tags: ${tagNames.join(', ')}` : 'Tags: (none)';
    return `${h.text}\n${tagsLine}\nURL: ${h.url}${noteLine ? `\n${noteLine}` : ''}`;
  }).filter(Boolean);

  const textToCopy = lines.join('\n\n');

  try {
    await navigator.clipboard.writeText(textToCopy);
    alert(`Copied ${idsToCopy.length} highlight${idsToCopy.length !== 1 ? 's' : ''} to clipboard.`);
  } catch (err) {
    // Fallback: select text content
    const selection = window.getSelection();
    if (!selection) return;
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.textContent = textToCopy;
    document.body.appendChild(tempDiv);
    const range = document.createRange();
    range.selectNodeContents(tempDiv);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    document.body.removeChild(tempDiv);
    alert(`Copied ${idsToCopy.length} highlight${idsToCopy.length !== 1 ? 's' : ''} to clipboard.`);
  }
}

// Populate tag filter dropdown
function populateTagFilter() {
  const filterSelect = document.getElementById('filterTag');
  const currentValue = filterSelect.value;
  
  // Clear existing options except "All Tags"
  filterSelect.innerHTML = '<option value="">All Tags</option>';

  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    filterSelect.appendChild(option);
  });

  // Restore selection
  filterSelect.value = currentValue;
  populateHighlightSelectionTag();
}

// Populate highlight selection tag dropdown
function populateHighlightSelectionTag() {
  const select = document.getElementById('highlightSelectionTag');
  if (!select) return;
  const currentValue = select.value;

  select.innerHTML = '<option value="">Select tag...</option>';
  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    select.appendChild(option);
  });
  select.value = currentValue;
}

// Tag modal functions (reusing logic from popup.js)
function openTagModal(tagId = null) {
  const modal = document.getElementById('tagModal');
  const modalTitle = document.getElementById('modalTitle');
  const tagNameInput = document.getElementById('tagName');
  const tagColorInput = document.getElementById('tagColor');
  const parentTagsSelect = document.getElementById('parentTags');
  const deleteBtn = document.getElementById('deleteTagBtn');
  const currentParentsDiv = document.getElementById('currentParents');
  const currentChildrenDiv = document.getElementById('currentChildren');

  currentEditingTagId = tagId;

  if (tagId) {
    const tag = tags.find(t => t.id === tagId);
    modalTitle.textContent = 'Edit Tag';
    tagNameInput.value = tag.name;
    tagColorInput.value = tag.color;
    deleteBtn.style.display = 'inline-block';
    currentParentsDiv.style.display = 'block';
    currentChildrenDiv.style.display = 'block';
    if (!tag.parentIds) {
      tag.parentIds = [];
    }
  } else {
    modalTitle.textContent = 'Create Tag';
    tagNameInput.value = '';
    tagColorInput.value = '#ffeb3b';
    deleteBtn.style.display = 'none';
    currentParentsDiv.style.display = 'none';
    currentChildrenDiv.style.display = 'none';
    window.tempNewTagParents = [];
    window.tempNewTagChildren = [];
  }

  populateParentTagsSelect(tagId);
  populateChildTagsSelect(tagId);
  if (tagId) {
    updateCurrentParentsDisplay();
    updateCurrentChildrenDisplay();
  } else {
    updateCurrentParentsDisplay([]);
    updateCurrentChildrenDisplay([]);
  }

  modal.classList.add('show');
}

function populateParentTagsSelect(excludeTagId = null) {
  const parentTagsSelect = document.getElementById('parentTags');
  parentTagsSelect.innerHTML = '';

  const availableTags = tags.filter(t => t.id !== excludeTagId);
  
  if (availableTags.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No other tags available';
    option.disabled = true;
    parentTagsSelect.appendChild(option);
    return;
  }

  availableTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    parentTagsSelect.appendChild(option);
  });

  if (excludeTagId) {
    const tag = tags.find(t => t.id === excludeTagId);
    if (tag && tag.parentIds) {
      tag.parentIds.forEach(parentId => {
        const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
        if (option) {
          option.selected = true;
        }
      });
    }
  }
}

function updateCurrentParents() {
  const parentTagsSelect = document.getElementById('parentTags');
  const selectedParentIds = Array.from(parentTagsSelect.selectedOptions).map(opt => opt.value);
  const currentParentsDiv = document.getElementById('currentParents');
  
  if (currentEditingTagId) {
    const tag = tags.find(t => t.id === currentEditingTagId);
    if (tag) {
      tag.parentIds = selectedParentIds;
    }
  } else {
    if (!window.tempNewTagParents) {
      window.tempNewTagParents = [];
    }
    window.tempNewTagParents = selectedParentIds;
  }
  
  if (selectedParentIds.length > 0) {
    currentParentsDiv.style.display = 'block';
    updateCurrentParentsDisplay(selectedParentIds);
  } else {
    currentParentsDiv.style.display = currentEditingTagId ? 'block' : 'none';
    updateCurrentParentsDisplay([]);
  }
}

function updateCurrentParentsDisplay(parentIds = null) {
  const parentsList = document.getElementById('parentsList');
  parentsList.innerHTML = '';

  let displayParentIds = parentIds;
  if (displayParentIds === null) {
    if (currentEditingTagId) {
      const tag = tags.find(t => t.id === currentEditingTagId);
      displayParentIds = tag ? (tag.parentIds || []) : [];
    } else {
      displayParentIds = window.tempNewTagParents || [];
    }
  }

  if (displayParentIds.length === 0) {
    parentsList.innerHTML = '<div style="color: #999; font-size: 13px;">No parents selected</div>';
    return;
  }

  displayParentIds.forEach(parentId => {
    const parentTag = tags.find(t => t.id === parentId);
    if (parentTag) {
      const chip = document.createElement('div');
      chip.className = 'parent-chip';
      const tagIdForRemove = currentEditingTagId || 'new';
      chip.innerHTML = `
        <span class="parent-name">${escapeHtml(parentTag.name)}</span>
        <button class="remove-parent" onclick="removeParent('${tagIdForRemove}', '${parentId}')" title="Remove parent">×</button>
      `;
      parentsList.appendChild(chip);
    }
  });
}

function removeParent(tagId, parentId) {
  if (tagId === 'new') {
    if (!window.tempNewTagParents) {
      window.tempNewTagParents = [];
    }
    window.tempNewTagParents = window.tempNewTagParents.filter(id => id !== parentId);
    const parentTagsSelect = document.getElementById('parentTags');
    const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
    if (option) {
      option.selected = false;
    }
    updateCurrentParents();
  } else {
    const tag = tags.find(t => t.id === tagId);
    if (tag) {
      if (!tag.parentIds) {
        tag.parentIds = [];
      }
      tag.parentIds = tag.parentIds.filter(id => id !== parentId);
      const parentTagsSelect = document.getElementById('parentTags');
      const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
      if (option) {
        option.selected = false;
      }
      saveTags().then(() => {
        updateCurrentParentsDisplay();
        populateParentTagsSelect(tagId);
        renderTags();
        updateStats();
      });
    }
  }
}

// Populate child tags dropdown
function populateChildTagsSelect(excludeTagId = null) {
  const childTagsSelect = document.getElementById('childTags');
  childTagsSelect.innerHTML = '';

  const availableTags = tags.filter(t => t.id !== excludeTagId);
  
  if (availableTags.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No other tags available';
    option.disabled = true;
    childTagsSelect.appendChild(option);
    return;
  }

  availableTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    childTagsSelect.appendChild(option);
  });

  // Select current children if editing (find tags that have this tag as parent)
  if (excludeTagId) {
    const childTagIds = tags
      .filter(t => t.parentIds && t.parentIds.includes(excludeTagId))
      .map(t => t.id);
    
    childTagIds.forEach(childId => {
      const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
      if (option) {
        option.selected = true;
      }
    });
  }
}

// Update current children display when selection changes
function updateCurrentChildren() {
  const childTagsSelect = document.getElementById('childTags');
  const selectedChildIds = Array.from(childTagsSelect.selectedOptions).map(opt => opt.value);
  const currentChildrenDiv = document.getElementById('currentChildren');
  
  if (currentEditingTagId) {
    // Store selection temporarily - will be processed in saveTag
    if (!window.tempEditTagChildren) {
      window.tempEditTagChildren = [];
    }
    window.tempEditTagChildren = selectedChildIds;
  } else {
    // For new tags, store selection temporarily
    if (!window.tempNewTagChildren) {
      window.tempNewTagChildren = [];
    }
    window.tempNewTagChildren = selectedChildIds;
  }
  
  if (selectedChildIds.length > 0) {
    currentChildrenDiv.style.display = 'block';
    updateCurrentChildrenDisplay(selectedChildIds);
  } else {
    currentChildrenDiv.style.display = currentEditingTagId ? 'block' : 'none';
    updateCurrentChildrenDisplay([]);
  }
}

// Display current child tags
function updateCurrentChildrenDisplay(childIds = null) {
  const childrenList = document.getElementById('childrenList');
  childrenList.innerHTML = '';

  let displayChildIds = childIds;
  if (displayChildIds === null) {
    if (currentEditingTagId) {
      // Find tags that have this tag as parent
      displayChildIds = tags
        .filter(t => t.parentIds && t.parentIds.includes(currentEditingTagId))
        .map(t => t.id);
    } else {
      displayChildIds = window.tempNewTagChildren || [];
    }
  }

  if (displayChildIds.length === 0) {
    childrenList.innerHTML = '<div style="color: #999; font-size: 13px;">No children selected</div>';
    return;
  }

  displayChildIds.forEach(childId => {
    const childTag = tags.find(t => t.id === childId);
    if (childTag) {
      const chip = document.createElement('div');
      chip.className = 'parent-chip';
      const tagIdForRemove = currentEditingTagId || 'new';
      chip.innerHTML = `
        <span class="parent-name">${escapeHtml(childTag.name)}</span>
        <button class="remove-parent" onclick="removeChild('${tagIdForRemove}', '${childId}')" title="Remove child">×</button>
      `;
      childrenList.appendChild(chip);
    }
  });
}

// Remove a child from a tag
function removeChild(tagId, childId) {
  if (tagId === 'new') {
    // Removing child from new tag being created
    if (!window.tempNewTagChildren) {
      window.tempNewTagChildren = [];
    }
    window.tempNewTagChildren = window.tempNewTagChildren.filter(id => id !== childId);
    const childTagsSelect = document.getElementById('childTags');
    const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
    if (option) {
      option.selected = false;
    }
    updateCurrentChildren();
  } else {
    // Removing child from existing tag - remove this tag from child's parentIds
    const childTag = tags.find(t => t.id === childId);
    if (childTag) {
      if (!childTag.parentIds) {
        childTag.parentIds = [];
      }
      childTag.parentIds = childTag.parentIds.filter(id => id !== tagId);
      
      // Update dropdown selection
      const childTagsSelect = document.getElementById('childTags');
      const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
      if (option) {
        option.selected = false;
      }
      
      saveTags().then(() => {
        updateCurrentChildrenDisplay();
        populateChildTagsSelect(tagId);
        renderTags();
        updateStats();
      });
    }
  }
}

async function saveTag() {
  const tagNameInput = document.getElementById('tagName');
  const tagColorInput = document.getElementById('tagColor');
  const parentTagsSelect = document.getElementById('parentTags');
  const childTagsSelect = document.getElementById('childTags');

  const name = tagNameInput.value.trim();
  if (!name) {
    alert('Please enter a tag name');
    return;
  }

  const existingTag = tags.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== currentEditingTagId);
  if (existingTag) {
    alert('A tag with this name already exists');
    return;
  }

  const color = tagColorInput.value;
  let selectedParentIds = Array.from(parentTagsSelect.selectedOptions).map(opt => opt.value);
  let selectedChildIds = Array.from(childTagsSelect.selectedOptions).map(opt => opt.value);
  
  if (!currentEditingTagId && window.tempNewTagParents) {
    selectedParentIds = window.tempNewTagParents;
  }
  if (!currentEditingTagId && window.tempNewTagChildren) {
    selectedChildIds = window.tempNewTagChildren;
  } else if (currentEditingTagId && window.tempEditTagChildren) {
    selectedChildIds = window.tempEditTagChildren;
  }

  const tagIdToUpdate = currentEditingTagId || ('tag-' + Date.now());

  if (currentEditingTagId) {
    const tag = tags.find(t => t.id === currentEditingTagId);
    if (tag) {
      tag.name = name;
      tag.color = color;
      tag.parentIds = selectedParentIds;
      tag.updatedAt = Date.now();
    }
  } else {
    const newTag = {
      id: tagIdToUpdate,
      name: name,
      color: color,
      parentIds: selectedParentIds,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    tags.push(newTag);
  }

  // Handle child relationships - update children's parentIds to include this tag
  if (currentEditingTagId) {
    // First, remove this tag from all tags that currently have it as parent but shouldn't
    const currentChildren = tags.filter(t => t.parentIds && t.parentIds.includes(currentEditingTagId));
    currentChildren.forEach(child => {
      if (!selectedChildIds.includes(child.id)) {
        child.parentIds = child.parentIds.filter(id => id !== currentEditingTagId);
      }
    });
    
    // Then, add this tag to selected children's parentIds
    selectedChildIds.forEach(childId => {
      const childTag = tags.find(t => t.id === childId);
      if (childTag) {
        if (!childTag.parentIds) {
          childTag.parentIds = [];
        }
        if (!childTag.parentIds.includes(currentEditingTagId)) {
          childTag.parentIds.push(currentEditingTagId);
        }
      }
    });
  } else {
    // For new tags, update children after creating the tag
    selectedChildIds.forEach(childId => {
      const childTag = tags.find(t => t.id === childId);
      if (childTag) {
        if (!childTag.parentIds) {
          childTag.parentIds = [];
        }
        if (!childTag.parentIds.includes(tagIdToUpdate)) {
          childTag.parentIds.push(tagIdToUpdate);
        }
      }
    });
  }

  await saveTags();
  renderTags();
  populateTagFilter();
  populateHighlightSelectionTag();
  updateStats();
  closeTagModal();
  
  if (window.tempNewTagParents) {
    delete window.tempNewTagParents;
  }
  if (window.tempNewTagChildren) {
    delete window.tempNewTagChildren;
  }
  if (window.tempEditTagChildren) {
    delete window.tempEditTagChildren;
  }
}

function editTag(tagId) {
  openTagModal(tagId);
}

async function deleteTag() {
  if (!currentEditingTagId) return;

  if (confirm('Are you sure you want to delete this tag? This will also remove it from all highlights.')) {
    tags = tags.filter(t => t.id !== currentEditingTagId);

    tags.forEach(tag => {
      if (tag.parentIds) {
        tag.parentIds = tag.parentIds.filter(id => id !== currentEditingTagId);
      }
    });

    allHighlights = allHighlights.map(highlight => {
      if (highlight.tags) {
        highlight.tags = highlight.tags.filter(id => id !== currentEditingTagId);
      }
      return highlight;
    });

    await saveTags();
    await chrome.storage.local.set({ highlights: allHighlights });
    
    // Sync to cloud if logged in
    if (window.authService && window.authService.getCurrentUser()) {
      window.authService.syncHighlightsToCloud().catch(err => {
        console.error('Error syncing highlights to cloud:', err);
      });
    }
    
    renderTags();
    renderHighlights();
    populateTagFilter();
    populateHighlightSelectionTag();
    updateStats();
    closeTagModal();
  }
}

function closeTagModal() {
  const modal = document.getElementById('tagModal');
  modal.classList.remove('show');
  currentEditingTagId = null;
  
  document.getElementById('tagName').value = '';
  document.getElementById('tagColor').value = '#ffeb3b';
  document.getElementById('parentTags').selectedIndex = -1;
  document.getElementById('childTags').selectedIndex = -1;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup note modal event listeners (for homepage)
document.addEventListener('DOMContentLoaded', () => {
  const noteModal = document.getElementById('noteModal');
  const saveNoteBtn = document.getElementById('saveNoteBtn');
  const cancelNoteBtn = document.getElementById('cancelNoteBtn');
  const deleteNoteBtn = document.getElementById('deleteNoteBtn');
  const closeNoteModal = document.getElementById('closeNoteModal');
  
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
      const noteText = document.getElementById('noteText').value.trim();
      const highlight = allHighlights.find(h => h.id === currentEditingHighlightId);
      
      if (highlight) {
        highlight.note = noteText;
        await saveAllHighlights();
        renderHighlights();
      }
      
      if (noteModal) noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (cancelNoteBtn) {
    cancelNoteBtn.addEventListener('click', () => {
      if (noteModal) noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (deleteNoteBtn) {
    deleteNoteBtn.addEventListener('click', async () => {
      const highlight = allHighlights.find(h => h.id === currentEditingHighlightId);
      if (highlight) {
        highlight.note = '';
        await saveAllHighlights();
        renderHighlights();
      }
      if (noteModal) noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (closeNoteModal) {
    closeNoteModal.addEventListener('click', () => {
      if (noteModal) noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (noteModal) {
    noteModal.addEventListener('click', (e) => {
      if (e.target.id === 'noteModal') {
        noteModal.classList.remove('show');
        currentEditingHighlightId = null;
      }
    });
  }
});

async function saveAllHighlights() {
  await chrome.storage.local.set({ highlights: allHighlights });
  
  // Sync to cloud if logged in
  if (window.authService && window.authService.getCurrentUser()) {
    window.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
}

// Edit highlight note function
function editHighlightNote(highlightId, currentNote = '') {
  currentEditingHighlightId = highlightId;
  const modal = document.getElementById('noteModal');
  const noteText = document.getElementById('noteText');
  const deleteBtn = document.getElementById('deleteNoteBtn');
  const modalTitle = document.getElementById('noteModalTitle');
  
  if (modal && noteText && modalTitle) {
    noteText.value = currentNote || '';
    modalTitle.textContent = currentNote ? 'Edit Note' : 'Add Note';
    if (deleteBtn) {
      deleteBtn.style.display = currentNote ? 'inline-block' : 'none';
    }
    modal.classList.add('show');
  }
}

// Add tag to highlight
async function addTagToHighlight(highlightId) {
  const highlight = allHighlights.find(h => h.id === highlightId);
  if (!highlight) return;
  
  // Get all tags
  const result = await chrome.storage.local.get(['tags']);
  const allTags = result.tags || [];
  
  if (allTags.length === 0) {
    alert('No tags available. Please create a tag first.');
    return;
  }
  
  // Create a simple modal for tag selection
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
  modal.id = 'addTagModal';
  
  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 24px; border-radius: 8px; max-width: 400px; width: 90%; max-height: 80vh; overflow-y: auto;';
  
  const currentTagIds = highlight.tags || [];
  const availableTags = allTags.filter(tag => !currentTagIds.includes(tag.id));
  const isEditMode = currentTagIds.length > 0;
  const tagsToRender = isEditMode ? allTags : availableTags;
  
  let tagCheckboxes = '';
  tagsToRender.forEach(tag => {
    tagCheckboxes += `
      <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
        <input type="checkbox" value="${tag.id}" ${currentTagIds.includes(tag.id) ? 'checked' : ''}>
        <span style="width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;"></span>
        <span>${escapeHtml(tag.name)}</span>
      </label>
    `;
  });
  
  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0;">Add Tags to Highlight</h3>
    <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
      ${availableTags.length === 0 && !isEditMode ? '<p style="color: #666;">All available tags are already added to this highlight.</p>' : tagCheckboxes}
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="cancelAddTag" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="saveAddTag" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 4px; cursor: pointer;">Save</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  content.querySelector('#cancelAddTag').addEventListener('click', () => modal.remove());
  content.querySelector('#saveAddTag').addEventListener('click', async () => {
    const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
    const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedTagIds.length === 0 && !isEditMode) {
      alert('Please select at least one tag.');
      return;
    }
    // Automatically include all parent tags
    const expandedTagIds = expandTagsWithParents(selectedTagIds, allTags);
    
    // Update highlight
    highlight.tags = expandedTagIds;
    
    // Save to storage
    await saveAllHighlights();
    
    // Update in background
    chrome.runtime.sendMessage({
      action: 'updateHighlight',
      highlightId: highlight.id,
      tags: highlight.tags,
      note: highlight.note || ''
    });
    
    modal.remove();
    renderHighlights();
    updateStats();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Tag selection functions
function toggleTagSelectionPanel() {
  const panel = document.getElementById('tagSelectionPanel');
  const selectBtn = document.getElementById('selectTagsBtn');
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : 'block';
  
  if (!isVisible) {
    // Show checkboxes in all tag items
    document.querySelectorAll('.tag-checkbox').forEach(cb => {
      cb.style.display = 'block';
    });
    updateSelectedTagsCount();
    if (selectBtn) {
      selectBtn.textContent = 'Cancel Selection';
      selectBtn.classList.remove('btn-secondary');
      selectBtn.classList.add('btn-danger');
    }
  } else {
    // Hide checkboxes and clear selection
    document.querySelectorAll('.tag-checkbox').forEach(cb => {
      cb.style.display = 'none';
      cb.checked = false;
    });
    const actionsDiv = document.querySelector('.selection-actions');
    if (actionsDiv) {
      actionsDiv.style.display = 'none';
    }
    if (selectBtn) {
      selectBtn.textContent = 'Select Tags';
      selectBtn.classList.remove('btn-danger');
      selectBtn.classList.add('btn-secondary');
    }
  }
}

function handleSelectionCriteriaChange() {
  const criteria = document.getElementById('selectionCriteria').value;
  const valueInput = document.getElementById('selectionValue');
  const parentSelect = document.getElementById('selectionParentTag');
  
  valueInput.style.display = 'none';
  parentSelect.style.display = 'none';
  
  if (criteria === 'name') {
    valueInput.style.display = 'inline-block';
  } else if (criteria === 'parent') {
    parentSelect.style.display = 'inline-block';
    populateParentTagSelect();
  }
}

function populateParentTagSelect() {
  const select = document.getElementById('selectionParentTag');
  select.innerHTML = '<option value="">Select parent tag...</option>';
  
  tags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    select.appendChild(option);
  });
}

function applyTagSelection() {
  const criteria = document.getElementById('selectionCriteria').value;
  const valueInput = document.getElementById('selectionValue');
  const parentSelect = document.getElementById('selectionParentTag');
  
  let selectedTagIds = [];
  
  switch (criteria) {
    case 'all':
      selectedTagIds = tags.map(t => t.id);
      break;
    case 'name':
      const searchTerm = valueInput.value.toLowerCase().trim();
      if (!searchTerm) {
        alert('Please enter a search term');
        return;
      }
      selectedTagIds = tags
        .filter(t => t.name.toLowerCase().includes(searchTerm))
        .map(t => t.id);
      break;
    case 'parent':
      const parentId = parentSelect.value;
      if (!parentId) {
        alert('Please select a parent tag');
        return;
      }
      selectedTagIds = tags
        .filter(t => t.parentIds && t.parentIds.includes(parentId))
        .map(t => t.id);
      break;
    case 'no-parent':
      selectedTagIds = tags
        .filter(t => !t.parentIds || t.parentIds.length === 0)
        .map(t => t.id);
      break;
  }
  
  // Update checkboxes
  document.querySelectorAll('.tag-checkbox').forEach(cb => {
    cb.checked = selectedTagIds.includes(cb.dataset.tagId);
  });
  
  updateSelectedTagsCount();
}

function clearTagSelection() {
  document.querySelectorAll('.tag-checkbox').forEach(cb => {
    cb.checked = false;
  });
  updateSelectedTagsCount();
}

function updateSelectedTagsCount() {
  const checkedBoxes = document.querySelectorAll('.tag-checkbox:checked');
  const count = checkedBoxes.length;
  const countSpan = document.getElementById('selectedCount');
  const actionsDiv = document.querySelector('.selection-actions');
  document.querySelectorAll('.tag-checkbox').forEach(cb => {
    const item = cb.closest('.tag-item');
    if (item) {
      item.classList.toggle('tag-selected', cb.checked);
    }
  });
  
  if (countSpan) {
    countSpan.textContent = `${count} tag${count !== 1 ? 's' : ''} selected`;
  }
  
  if (actionsDiv) {
    actionsDiv.style.display = count > 0 ? 'flex' : 'none';
  }
}

async function deleteSelectedTags() {
  const checkedBoxes = document.querySelectorAll('.tag-checkbox:checked');
  const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.tagId);
  
  if (selectedIds.length === 0) {
    alert('No tags selected');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete ${selectedIds.length} tag(s)? This will also remove them from all highlights.`)) {
    return;
  }
  
  // Remove selected tags
  tags = tags.filter(t => !selectedIds.includes(t.id));
  
  // Remove deleted tags from other tags' parentIds
  tags.forEach(tag => {
    if (tag.parentIds) {
      tag.parentIds = tag.parentIds.filter(id => !selectedIds.includes(id));
    }
  });
  
  // Remove deleted tags from highlights
  allHighlights = allHighlights.map(highlight => {
    if (highlight.tags) {
      highlight.tags = highlight.tags.filter(id => !selectedIds.includes(id));
    }
    return highlight;
  });
  
  await saveTags();
  await chrome.storage.local.set({ highlights: allHighlights });
  
  // Sync to cloud if logged in
  if (window.authService && window.authService.getCurrentUser()) {
    window.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
  
  renderTags();
  renderHighlights();
  populateTagFilter();
  populateHighlightSelectionTag();
  updateStats();
  clearTagSelection();
}

function showMakeChildrenModal() {
  const checkedBoxes = document.querySelectorAll('.tag-checkbox:checked');
  const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.tagId);
  
  if (selectedIds.length === 0) {
    alert('No tags selected');
    return;
  }
  
  // Create modal for selecting parent tag
  const modal = document.createElement('div');
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
  modal.id = 'makeChildrenModal';
  
  const content = document.createElement('div');
  content.style.cssText = 'background: white; padding: 24px; border-radius: 8px; max-width: 400px; width: 90%;';
  
  const availableParents = tags.filter(t => !selectedIds.includes(t.id));
  
  let optionsHtml = '<option value="">None (remove parents)</option>';
  availableParents.forEach(tag => {
    optionsHtml += `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`;
  });
  
  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0;">Make Selected Tags Children Of...</h3>
    <p style="margin-bottom: 16px; color: #666; font-size: 14px;">Select a parent tag for ${selectedIds.length} selected tag(s). Choose "None" to remove all parents.</p>
    <select id="newParentTag" class="filter-select" style="width: 100%; margin-bottom: 16px;">
      ${optionsHtml}
    </select>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="cancelMakeChildren" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="saveMakeChildren" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 4px; cursor: pointer;">Apply</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  content.querySelector('#cancelMakeChildren').addEventListener('click', () => modal.remove());
  content.querySelector('#saveMakeChildren').addEventListener('click', async () => {
    const newParentId = content.querySelector('#newParentTag').value;
    
    // Update selected tags' parentIds
    selectedIds.forEach(tagId => {
      const tag = tags.find(t => t.id === tagId);
      if (tag) {
        if (newParentId) {
          if (!tag.parentIds) {
            tag.parentIds = [];
          }
          // Remove all existing parents and set the new one
          tag.parentIds = [newParentId];
        } else {
          // Remove all parents
          tag.parentIds = [];
        }
      }
    });
    
    await saveTags();
    renderTags();
    populateTagFilter();
    updateStats();
    clearTagSelection();
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Make functions available globally
window.editTag = editTag;
window.removeParent = removeParent;
window.removeChild = removeChild;
window.editHighlightNote = editHighlightNote;
window.addTagToHighlight = addTagToHighlight;

