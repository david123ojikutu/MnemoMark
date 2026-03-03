// Popup script for tag and highlight management

let tags = [];
let currentEditingTagId = null;
let highlights = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadTags().then(() => {
    loadHighlights();
    checkSelectedText();
  });
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('createTagBtn').addEventListener('click', () => {
    openTagModal();
  });

  document.getElementById('closeModal').addEventListener('click', closeTagModal);
  document.getElementById('cancelTagBtn').addEventListener('click', closeTagModal);
  document.getElementById('saveTagBtn').addEventListener('click', saveTag);
  document.getElementById('deleteTagBtn').addEventListener('click', deleteTag);
  document.getElementById('parentTags').addEventListener('change', updateCurrentParents);
  document.getElementById('childTags').addEventListener('change', updateCurrentChildren);

  document.getElementById('highlightBtn').addEventListener('click', showTagSelection);
  document.getElementById('applyTagsBtn').addEventListener('click', applyHighlight);

  const openHomepageLink = document.getElementById('openHomepage');
  if (openHomepageLink) {
    openHomepageLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  // Close modal when clicking outside
  document.getElementById('tagModal').addEventListener('click', (e) => {
    if (e.target.id === 'tagModal') {
      closeTagModal();
    }
  });
}

// Load tags from storage
async function loadTags() {
  // If user is logged in and sharing tags, sync from cloud first
  if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
    await window.authService.syncTagsFromCloud();
  }

  const result = await chrome.storage.local.get(['tags']);
  tags = result.tags || [];
  renderTags();
}

// Save tags to storage
async function saveTags() {
  await chrome.storage.local.set({ tags });

  // Sync to cloud if user is logged in and sharing tags
  if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
    await window.authService.syncTagsToCloud();
  }
}

// Render tags list
function renderTags() {
  const tagsList = document.getElementById('tagsList');
  tagsList.innerHTML = '';

  if (tags.length === 0) {
    tagsList.innerHTML = '<div class="empty-state">No tags created yet. Click "Create Tag" to get started.</div>';
    return;
  }

  tags.forEach(tag => {
    const tagItem = document.createElement('div');
    tagItem.className = 'tag-item';

    const parents = getTagParents(tag.id);
    const parentNames = parents.map(p => p.name).join(', ');

    tagItem.innerHTML = `
      <div class="tag-info">
        <div class="tag-color" style="background-color: ${tag.color}"></div>
        <div>
          <div class="tag-name">${escapeHtml(tag.name)}</div>
          ${parentNames ? `<div class="tag-parents">Parents: ${escapeHtml(parentNames)}</div>` : ''}
        </div>
      </div>
      <div class="tag-actions">
        <button class="btn btn-small btn-primary btn-edit-tag" data-tag-id="${tag.id}">Edit</button>
      </div>
    `;

    const editBtn = tagItem.querySelector('.btn-edit-tag');
    if (editBtn) {
      editBtn.addEventListener('click', () => editTag(tag.id));
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

// Helper function to recursively get all parent tags (including grandparents, etc.)
function getAllParentTags(tagId, visited = new Set()) {
  if (visited.has(tagId)) {
    return []; // Prevent infinite loops in case of circular references
  }
  visited.add(tagId);
  
  const tag = tags.find(t => t.id === tagId);
  if (!tag || !tag.parentIds || tag.parentIds.length === 0) {
    return [];
  }
  
  const parentTags = [];
  tag.parentIds.forEach(parentId => {
    const parentTag = tags.find(t => t.id === parentId);
    if (parentTag) {
      parentTags.push(parentTag.id);
      // Recursively get grandparents, etc.
      const grandparentTags = getAllParentTags(parentId, visited);
      parentTags.push(...grandparentTags);
    }
  });
  
  return parentTags;
}

// Helper function to expand tag IDs to include all parent tags
function expandTagsWithParents(tagIds) {
  if (!tagIds || tagIds.length === 0) {
    return [];
  }
  
  const expandedTagIds = new Set(tagIds);
  
  tagIds.forEach(tagId => {
    const parentTagIds = getAllParentTags(tagId);
    parentTagIds.forEach(parentId => expandedTagIds.add(parentId));
  });
  
  return Array.from(expandedTagIds);
}

// Open tag modal for creation or editing
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
    // Editing existing tag
    const tag = tags.find(t => t.id === tagId);
    modalTitle.textContent = 'Edit Tag';
    tagNameInput.value = tag.name;
    tagColorInput.value = tag.color;
    deleteBtn.style.display = 'inline-block';
    currentParentsDiv.style.display = 'block';
    currentChildrenDiv.style.display = 'block';
    
    // Ensure parentIds exists
    if (!tag.parentIds) {
      tag.parentIds = [];
    }
  } else {
    // Creating new tag
    modalTitle.textContent = 'Create Tag';
    tagNameInput.value = '';
    tagColorInput.value = '#ffeb3b';
    deleteBtn.style.display = 'none';
    currentParentsDiv.style.display = 'none';
    currentChildrenDiv.style.display = 'none';
    window.tempNewTagParents = [];
    window.tempNewTagChildren = [];
  }

  // Populate parent tags dropdown (exclude current tag if editing)
  populateParentTagsSelect(tagId);
  populateChildTagsSelect(tagId);
  
  // Update current parents and children display
  if (tagId) {
    updateCurrentParentsDisplay();
    updateCurrentChildrenDisplay();
  } else {
    updateCurrentParentsDisplay([]);
    updateCurrentChildrenDisplay([]);
  }

  modal.classList.add('show');
}

// Populate parent tags dropdown
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

  // Select current parents if editing
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

// Update current parents display when selection changes
function updateCurrentParents() {
  const parentTagsSelect = document.getElementById('parentTags');
  const selectedParentIds = Array.from(parentTagsSelect.selectedOptions).map(opt => opt.value);
  const currentParentsDiv = document.getElementById('currentParents');
  
  if (currentEditingTagId) {
    // Update tag's parentIds in memory based on dropdown selection
    const tag = tags.find(t => t.id === currentEditingTagId);
    if (tag) {
      tag.parentIds = selectedParentIds;
    }
  } else {
    // For new tags, store selection temporarily
    if (!window.tempNewTagParents) {
      window.tempNewTagParents = [];
    }
    window.tempNewTagParents = selectedParentIds;
  }
  
  // Show current parents section if any parents are selected
  if (selectedParentIds.length > 0) {
    currentParentsDiv.style.display = 'block';
    updateCurrentParentsDisplay(selectedParentIds);
  } else {
    currentParentsDiv.style.display = currentEditingTagId ? 'block' : 'none';
    updateCurrentParentsDisplay([]);
  }
}

// Display current parent tags
function updateCurrentParentsDisplay(parentIds = null) {
  const parentsList = document.getElementById('parentsList');
  parentsList.innerHTML = '';

  // Get parent IDs to display
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

// Remove a parent from a tag
function removeParent(tagId, parentId) {
  if (tagId === 'new') {
    // Removing parent from new tag being created
    if (!window.tempNewTagParents) {
      window.tempNewTagParents = [];
    }
    window.tempNewTagParents = window.tempNewTagParents.filter(id => id !== parentId);
    
    // Update dropdown selection
    const parentTagsSelect = document.getElementById('parentTags');
    const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
    if (option) {
      option.selected = false;
    }
    updateCurrentParents();
  } else {
    // Removing parent from existing tag
    const tag = tags.find(t => t.id === tagId);
    if (tag) {
      if (!tag.parentIds) {
        tag.parentIds = [];
      }
      tag.parentIds = tag.parentIds.filter(id => id !== parentId);
      
      // Update dropdown selection
      const parentTagsSelect = document.getElementById('parentTags');
      const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
      if (option) {
        option.selected = false;
      }
      
      saveTags().then(() => {
        updateCurrentParentsDisplay();
        populateParentTagsSelect(tagId);
        renderTags();
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
      });
    }
  }
}

// Save tag (create or update)
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

  // Check for duplicate names (excluding current tag if editing)
  const existingTag = tags.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== currentEditingTagId);
  if (existingTag) {
    alert('A tag with this name already exists');
    return;
  }

  const color = tagColorInput.value;
  let selectedParentIds = Array.from(parentTagsSelect.selectedOptions).map(opt => opt.value);
  let selectedChildIds = Array.from(childTagsSelect.selectedOptions).map(opt => opt.value);
  
  // For new tags, use temp storage if available
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
    // Update existing tag
    const tag = tags.find(t => t.id === currentEditingTagId);
    if (tag) {
      tag.name = name;
      tag.color = color;
      tag.parentIds = selectedParentIds;
      tag.updatedAt = Date.now();
    }
  } else {
    // Create new tag
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
  closeTagModal();
  
  // Clean up temp storage
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

// Edit tag
function editTag(tagId) {
  openTagModal(tagId);
}

// Delete tag
async function deleteTag() {
  if (!currentEditingTagId) return;

  if (confirm('Are you sure you want to delete this tag? This will also remove it from all highlights.')) {
    // Remove tag from tags array
    tags = tags.filter(t => t.id !== currentEditingTagId);

    // Remove tag from other tags' parentIds
    tags.forEach(tag => {
      if (tag.parentIds) {
        tag.parentIds = tag.parentIds.filter(id => id !== currentEditingTagId);
      }
    });

    // Remove tag from highlights
    highlights = highlights.map(highlight => {
      if (highlight.tags) {
        highlight.tags = highlight.tags.filter(id => id !== currentEditingTagId);
      }
      return highlight;
    });

    await saveTags();
    await chrome.storage.local.set({ highlights });
    
    // Sync to cloud if logged in
    if (window.authService && window.authService.getCurrentUser()) {
      window.authService.syncHighlightsToCloud().catch(err => {
        console.error('Error syncing highlights to cloud:', err);
      });
    }
    
    renderTags();
    loadHighlights();
    closeTagModal();
  }
}

// Close tag modal
function closeTagModal() {
  const modal = document.getElementById('tagModal');
  modal.classList.remove('show');
  currentEditingTagId = null;
  
  // Reset form
  document.getElementById('tagName').value = '';
  document.getElementById('tagColor').value = '#ffeb3b';
  document.getElementById('parentTags').selectedIndex = -1;
  document.getElementById('childTags').selectedIndex = -1;
}

// Load highlights for current page
async function loadHighlights() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.runtime.sendMessage({
    action: 'getHighlights',
    url: tab.url
  }, (response) => {
    if (response && response.highlights) {
      highlights = response.highlights;
      renderHighlights();
    }
  });
}

// Render highlights list
function renderHighlights() {
  const highlightsList = document.getElementById('highlightsList');
  highlightsList.innerHTML = '';

  if (highlights.length === 0) {
    highlightsList.innerHTML = '<div class="empty-state">No highlights on this page yet.</div>';
    return;
  }

  highlights.forEach(highlight => {
    const highlightItem = document.createElement('div');
    highlightItem.className = 'highlight-item';

    const tagNames = (highlight.tags && highlight.tags.length > 0)
      ? highlight.tags.map(tagId => {
          const tag = tags.find(t => t.id === tagId);
          return tag ? tag.name : tagId;
        }).join(', ')
      : 'No tags';

    highlightItem.innerHTML = `
      <div>
        <div style="margin-bottom: 4px; font-size: 13px; color: #666;">
          ${escapeHtml(highlight.text.substring(0, 100))}${highlight.text.length > 100 ? '...' : ''}
        </div>
        ${highlight.note ? `<div style="margin: 8px 0; padding: 8px; background: #f9f9f9; border-left: 3px solid #4CAF50; font-size: 12px; color: #555; border-radius: 3px;">
          <strong>Note:</strong> ${escapeHtml(highlight.note)}
          <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn-edit-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Edit Note</button>
            <button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">+ Add Tag</button>
          </div>
        </div>` : `<div style="margin: 4px 0; display: flex; gap: 6px; flex-wrap: wrap;"><button class="btn-add-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #f0f0f0; color: #666; border: 1px solid #ddd; border-radius: 3px; cursor: pointer;">+ Add Note</button><button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">+ Add Tag</button></div>`}
        <div style="font-size: 12px; color: #999; margin-bottom: 8px;">
          Tags: ${escapeHtml(tagNames)}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-delete-highlight" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;">Delete</button>
        </div>
      </div>
    `;

    highlightsList.appendChild(highlightItem);
    
    // Add event listeners for note buttons
    const addNoteBtn = highlightItem.querySelector('.btn-add-note');
    const editNoteBtn = highlightItem.querySelector('.btn-edit-note');
    const deleteBtn = highlightItem.querySelector('.btn-delete-highlight');
    const addTagBtn = highlightItem.querySelector('.btn-add-tag');
    
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
  });
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Check for selected text on the page
async function checkSelectedText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'getSelection' }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById('selectedText').textContent = 'Please select text on the page first';
      return;
    }
    
    if (response && response.text && response.text.trim()) {
      const selectedTextDiv = document.getElementById('selectedText');
      selectedTextDiv.textContent = `"${response.text.substring(0, 100)}${response.text.length > 100 ? '...' : ''}"`;
      selectedTextDiv.dataset.fullText = response.text;
      document.getElementById('highlightBtn').disabled = false;
    } else {
      document.getElementById('selectedText').textContent = 'Please select text on the page first';
      document.getElementById('highlightBtn').disabled = true;
    }
  });
}

// Show tag selection UI
function showTagSelection() {
  const tagSelection = document.getElementById('tagSelection');
  const tagCheckboxes = document.getElementById('tagCheckboxes');
  
  // Tags are optional - allow highlighting even without tags
  tagCheckboxes.innerHTML = '';
  
  if (tags.length === 0) {
    // Show message that tags are optional
    const message = document.createElement('p');
    message.textContent = 'No tags created yet. You can still highlight without tags.';
    message.style.cssText = 'color: #666; font-size: 13px; margin: 8px 0; padding: 8px; background: #f5f5f5; border-radius: 4px;';
    tagCheckboxes.appendChild(message);
  } else {
    tags.forEach(tag => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tag.id;
    
    const colorBox = document.createElement('span');
    colorBox.style.cssText = `width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;`;
    
    const name = document.createElement('span');
    name.textContent = tag.name;
    
    label.appendChild(checkbox);
    label.appendChild(colorBox);
    label.appendChild(name);
    tagCheckboxes.appendChild(label);
    });
  }
  
  tagSelection.style.display = 'block';
}

// Apply highlight with selected tags
async function applyHighlight() {
  const selectedTextDiv = document.getElementById('selectedText');
  const fullText = selectedTextDiv.dataset.fullText;
  
  if (!fullText) {
    alert('No text selected');
    return;
  }
  
  const checkboxes = document.querySelectorAll('#tagCheckboxes input[type="checkbox"]:checked');
  const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);
  
  // Automatically include all parent tags
  const expandedTagIds = expandTagsWithParents(selectedTagIds);
  const note = document.getElementById('highlightNote').value.trim();
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, {
    action: 'highlightText',
    selection: fullText,
    tags: expandedTagIds,
    note: note
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error highlighting:', chrome.runtime.lastError);
      alert('Error highlighting text. Please refresh the page and try again.');
      return;
    }
    
    // Reset UI
    document.getElementById('tagSelection').style.display = 'none';
    document.getElementById('highlightNote').value = '';
    selectedTextDiv.textContent = 'Please select text on the page first';
    selectedTextDiv.dataset.fullText = '';
    document.getElementById('highlightBtn').disabled = true;
    
    // Reload highlights
    loadHighlights();
  });
}

// Edit highlight note
let currentEditingHighlightId = null;

function editHighlightNote(highlightId, currentNote = '') {
  currentEditingHighlightId = highlightId;
  const modal = document.getElementById('noteModal');
  const noteText = document.getElementById('noteText');
  const deleteBtn = document.getElementById('deleteNoteBtn');
  const modalTitle = document.getElementById('noteModalTitle');
  
  noteText.value = currentNote || '';
  modalTitle.textContent = currentNote ? 'Edit Note' : 'Add Note';
  deleteBtn.style.display = currentNote ? 'inline-block' : 'none';
  modal.classList.add('show');
}

// Setup note modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  const noteModal = document.getElementById('noteModal');
  const saveNoteBtn = document.getElementById('saveNoteBtn');
  const cancelNoteBtn = document.getElementById('cancelNoteBtn');
  const deleteNoteBtn = document.getElementById('deleteNoteBtn');
  const closeNoteModal = document.getElementById('closeNoteModal');
  
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', async () => {
      const noteText = document.getElementById('noteText').value.trim();
      const highlight = highlights.find(h => h.id === currentEditingHighlightId);
      
      if (highlight) {
        highlight.note = noteText;
        await saveHighlights();
        renderHighlights();
      }
      
      noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (cancelNoteBtn) {
    cancelNoteBtn.addEventListener('click', () => {
      noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (deleteNoteBtn) {
    deleteNoteBtn.addEventListener('click', async () => {
      const highlight = highlights.find(h => h.id === currentEditingHighlightId);
      if (highlight) {
        highlight.note = '';
        await saveHighlights();
        renderHighlights();
      }
      noteModal.classList.remove('show');
      currentEditingHighlightId = null;
    });
  }
  
  if (closeNoteModal) {
    closeNoteModal.addEventListener('click', () => {
      noteModal.classList.remove('show');
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

async function saveHighlights() {
  await chrome.storage.local.set({ highlights });
  
  // Sync to cloud if logged in
  if (window.authService && window.authService.getCurrentUser()) {
    window.authService.syncHighlightsToCloud().catch(err => {
      console.error('Error syncing highlights to cloud:', err);
    });
  }
}

// Delete highlight
async function deleteHighlight(highlightId) {
  if (!confirm('Are you sure you want to delete this highlight?')) {
    return;
  }
  
  // Remove from local array
  highlights = highlights.filter(h => h.id !== highlightId);
  
  // Save to storage
  await saveHighlights();
  
  // Remove from background storage
  chrome.runtime.sendMessage({
    action: 'deleteHighlight',
    id: highlightId
  });
  
  // Remove from page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, {
    action: 'removeHighlight',
    id: highlightId
  });
  
  // Reload highlights list
  renderHighlights();
}

// Add tag to highlight
async function addTagToHighlight(highlightId) {
  const highlight = highlights.find(h => h.id === highlightId);
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
  
  let tagCheckboxes = '';
  availableTags.forEach(tag => {
    tagCheckboxes += `
      <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
        <input type="checkbox" value="${tag.id}">
        <span style="width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #ddd; border-radius: 3px;"></span>
        <span>${escapeHtml(tag.name)}</span>
      </label>
    `;
  });
  
  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0;">Add Tags to Highlight</h3>
    <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
      ${availableTags.length === 0 ? '<p style="color: #666;">All available tags are already added to this highlight.</p>' : tagCheckboxes}
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="cancelAddTag" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="saveAddTag" style="padding: 8px 16px; border: none; background: #4CAF50; color: white; border-radius: 4px; cursor: pointer;">Add Tags</button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  content.querySelector('#cancelAddTag').addEventListener('click', () => modal.remove());
  content.querySelector('#saveAddTag').addEventListener('click', async () => {
    const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
    const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedTagIds.length === 0) {
      alert('Please select at least one tag.');
      return;
    }
    
    // Automatically include all parent tags
    const expandedTagIds = expandTagsWithParents(selectedTagIds);
    
    // Merge with existing tags
    const newTags = [...new Set([...currentTagIds, ...expandedTagIds])];
    
    // Update highlight
    highlight.tags = newTags;
    
    // Save to storage
    await chrome.storage.local.set({ highlights });
    
    // Sync to cloud if logged in
    if (window.authService && window.authService.getCurrentUser()) {
      window.authService.syncHighlightsToCloud().catch(err => {
        console.error('Error syncing highlights to cloud:', err);
      });
    }
    
    // Update in background
    chrome.runtime.sendMessage({
      action: 'updateHighlight',
      highlightId: highlight.id,
      tags: newTags,
      note: highlight.note || ''
    });
    
    modal.remove();
    renderHighlights();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Make functions available globally for inline event handlers
window.editTag = editTag;
window.removeParent = removeParent;
window.removeChild = removeChild;
window.editHighlightNote = editHighlightNote;
window.addTagToHighlight = addTagToHighlight;

