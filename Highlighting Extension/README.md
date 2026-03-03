# MnemoMark Chrome Extension

A Chrome extension for highlighting and tagging web content with support for multi-parent hierarchical tag relationships and notes on highlights.

## Features

- **Text Highlighting**: Highlight any text on web pages
- **Floating Highlight Button**: When you select text, a small icon appears next to the selection - click it to highlight!
- **Homepage/Options Page**: View all tags and highlights across all pages in one place
- **Hierarchical Tags**: Create tags with multi-parent relationships (a tag can have multiple parent tags)
- **Tag Management**: Create, edit, and delete tags with full parent relationship control
- **Tag Colors**: Assign custom colors to tags
- **Tag Creation/Editing UI**: 
  - Multi-select dropdown to choose parent tags
  - Visual display of current parents
  - Add/remove parent relationships easily

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension directory

## Usage

### Creating Tags

1. Click the extension icon in your Chrome toolbar
2. Click "Create Tag"
3. Enter a tag name
4. Choose a color (optional)
5. Select parent tags from the "Make child of..." dropdown (hold Ctrl/Cmd to select multiple)
6. Click "Save Tag"

### Editing Tags

1. Click "Edit" next to any tag in the tags list
2. Modify the tag name, color, or parent relationships
3. Use the dropdown to add new parents (select multiple with Ctrl/Cmd)
4. Click the × button on parent chips to remove parent relationships
5. Click "Save Tag"

### Highlighting Text

**Method 1: Floating Button (Recommended)**
1. Select text on any web page
2. A small green highlight button (✎) appears near the selection
3. Click the button
4. Select one or more tags
5. Click "Highlight"

**Method 2: Extension Popup**
1. Select text on any web page
2. Click the extension icon
3. Click "Highlight Selected Text"
4. Select one or more tags to apply to the highlight
5. Click "Apply Tags & Highlight"

### Viewing Highlights

- **Current Page**: All highlights for the current page are displayed in the extension popup
- **All Highlights**: Click "📊 View All Tags & Highlights" in the popup, or access the options page to see all highlights across all pages with search and filtering capabilities

## File Structure

- `manifest.json` - Extension configuration
- `background.js` - Background service worker for data management
- `content.js` - Content script for highlighting functionality
- `content.css` - Styles for highlights on pages
- `popup.html` - Extension popup UI
- `popup.css` - Styles for popup
- `popup.js` - Popup logic and tag management
- `homepage.html` - Options page showing all tags and highlights
- `homepage.css` - Styles for homepage
- `homepage.js` - Homepage logic for displaying all data
- `icons/` - Extension icons (16x16, 48x48, 128x128) - Icons are stored locally in this folder

## Tag Hierarchy

Tags support multi-parent relationships, meaning:
- A tag can have multiple parent tags
- This creates a flexible tagging system where tags can belong to multiple categories
- Example: A tag "Machine Learning" could have parents "AI" and "Data Science"

## Technical Details

- Uses Chrome Storage API for persistent data storage
- Highlights are stored with XPath references for precise text location
- All tag relationships are stored in a flat structure with parent ID references
- Content scripts inject highlighting styles dynamically

## Accessing the Homepage

The homepage (options page) can be accessed in several ways:
1. Click "📊 View All Tags & Highlights" link in the extension popup
2. Right-click the extension icon → "Options"
3. Go to `chrome://extensions/` → Find the extension → Click "Options" (or right-click icon → Options)

## Notes

- The floating highlight button appears automatically when you select text on any webpage
- Highlights are stored per-page and persist across browser sessions
- For production use, you may want to add features like:
  - Export/import tags and highlights
  - Tag hierarchy visualization
  - Better highlight persistence across page reloads (currently highlights are saved but not automatically restored on page load)

