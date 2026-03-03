# MnemoMark Chrome Extension - Comprehensive Description

## Overview

MnemoMark is a powerful Chrome browser extension designed to revolutionize how users interact with, organize, and remember web content. Built with Manifest V3, this extension provides an intuitive system for highlighting text across any webpage, organizing information through a flexible hierarchical tagging system, and maintaining comprehensive notes on highlighted content. The extension seamlessly integrates into the browsing experience, offering multiple methods for content capture and organization while maintaining persistent storage across browser sessions.

## Core Highlighting Features

### Text Highlighting Capabilities

MnemoMark enables users to highlight any selectable text on web pages with remarkable ease and precision. The extension supports highlighting across virtually all web content, including standard HTML pages, dynamic single-page applications (SPAs), embedded content, and even PDF documents viewed within Chrome's built-in PDF viewer. When text is highlighted, it is visually marked with a customizable color that corresponds to the tags applied. The highlighting system uses XPath references to precisely locate and store highlighted text, ensuring that highlights can be accurately associated with their source content.

### Floating Highlight Button

One of the most distinctive and user-friendly features of MnemoMark is the floating highlight button that appears automatically when users select text on any webpage. This elegant interface element materializes near the selected text, typically positioned above and to the right of the selection, providing immediate visual feedback and a one-click method to highlight content.

The floating button employs sophisticated positioning algorithms that automatically adjust its location to remain visible within the viewport, even when selections are made near screen edges. When clicked, it opens an inline tag selection modal that overlays the page content, allowing users to quickly assign one or more tags to their highlight without navigating away from the current page.

### Multiple Highlighting Methods

MnemoMark provides users with three distinct methods for creating highlights. The primary method utilizes the floating button, which offers the fastest workflow for quick highlighting during active reading. A secondary method involves using the extension popup, where users can select text and then click the extension icon to access highlighting controls. The third method leverages Chrome's context menu integration, allowing users to right-click on selected text and choose "Highlight selected text" from the context menu. This method is especially valuable when working with PDF documents, where the floating button may have limited functionality due to the PDF viewer's security restrictions.

## Advanced Tag System

### Hierarchical Tag Architecture

MnemoMark implements a sophisticated hierarchical tagging system that supports multi-parent relationships, meaning that any tag can have multiple parent tags simultaneously. This flexible architecture enables users to create complex organizational structures that reflect the nuanced relationships between different concepts and categories. For example, a tag labeled "Machine Learning" could simultaneously be a child of both "Artificial Intelligence" and "Data Science." This multi-parent capability creates a graph-like structure rather than a strict tree hierarchy, providing users with unprecedented flexibility in organizing their information.

### Tag Management Interface

The tag creation and editing interface in MnemoMark is designed to make complex hierarchical relationships easy to manage. When creating or editing a tag, users are presented with intuitive multi-select dropdowns that allow them to choose parent tags and child tags. The interface provides visual feedback through "chip" displays that show current parent and child relationships, with easy removal options via clickable × buttons. Each tag can be assigned a custom color using a standard color picker, enabling visual organization and quick identification. When highlights are created with tags, they inherit the color of the first selected tag, creating a visual coding system.

Tag names are validated to prevent duplicates (case-insensitive), ensuring data integrity. When tags are deleted, the system automatically cleans up all relationships. The tag system includes sophisticated relationship management that automatically maintains consistency across the tag hierarchy through bidirectional updates.

## PDF Document Support

MnemoMark includes comprehensive support for PDF documents viewed within Chrome's built-in PDF viewer. The extension employs multiple detection methods to identify PDF content, checking URL patterns, embedded PDF elements, PDF.js viewer components, and various PDF plugin containers. When a PDF is detected, the extension automatically displays a helpful information popup in the top-right corner of the page that appears approximately two seconds after the PDF loads, providing users with clear instructions on how to highlight text in PDFs. The popup explains that users should select text and then right-click to access the "Highlight selected text" context menu option. The popup includes a close button and automatically fades out after ten seconds, but it reappears every time a PDF is loaded.

PDF text selection presents unique challenges due to the way Chrome's PDF viewer renders content. MnemoMark addresses these challenges through multiple selection detection strategies, including event listeners on PDF.js text layers, polling mechanisms, and MutationObserver instances that watch for dynamically added content. For PDFs, highlights are stored with metadata indicating that they originated from PDF content, including the PDF URL, selected text, associated tags, notes, and timestamps.

## Authentication and Cloud Synchronization

MnemoMark integrates with Firebase Authentication and Firestore to provide optional cloud-based synchronization of tags between the Chrome extension and a companion desktop application. This synchronization feature is entirely optional—users can use the extension completely offline with local storage only—but when enabled, it provides seamless tag sharing across platforms. The authentication system uses Firebase's email/password authentication, and during account creation, users can opt-in to tag synchronization by checking a checkbox that enables sharing tags between the web extension and desktop app.

When tag synchronization is enabled, the extension automatically syncs tags to and from Firebase Firestore whenever tags are created, modified, or deleted. The system uses Firestore's real-time listeners to detect changes made on other devices, ensuring that tag updates propagate immediately across all connected applications through bidirectional synchronization.

## User Interface Components

### Extension Popup

The MnemoMark extension popup provides a compact yet comprehensive interface for managing tags and highlights on the current page. The popup is organized into clear sections: a header with the extension name and a "Create Tag" button, a tags list showing all available tags with their colors and parent relationships, a current page highlights section, and a highlight controls area for working with selected text. The popup automatically detects when text is selected and enables the "Highlight Selected Text" button, which reveals a tag selection interface where users can choose one or more tags to apply, add an optional note, and then create the highlight.

### Options Page (Homepage)

The MnemoMark options page serves as a comprehensive dashboard for managing all tags and highlights across the entire browsing history. The page features a statistics bar at the top showing the total number of tags, highlights, and unique pages with highlights. The page is organized into two main tabs: a Tags tab for managing the tag library and an All Highlights tab for viewing, searching, and filtering highlights. The All Highlights tab includes powerful search and filtering capabilities, allowing users to filter highlights by tag, search highlights by text content or URL, and view highlights with their associated tags, notes, and source URLs.

### Note Management System

MnemoMark includes a comprehensive note management system that allows users to add, edit, and delete notes on any highlight. Notes can be added when creating a highlight or added later through the highlights list interface. The note editing interface is accessible from both the extension popup and the options page. Notes are stored as part of the highlight data structure and are included in search operations.

## Technical Architecture

### Content Script Implementation

MnemoMark's content script is injected into all web pages, running at document_idle to ensure it doesn't interfere with page loading performance. The script implements sophisticated selection detection using multiple strategies: event listeners for mouseup, selectionchange, and keyup events; continuous polling for reliable selection detection on PDFs and dynamic content; and MutationObserver instances that watch for dynamically added content. The content script maintains persistent state across page navigations, especially important for single-page applications, and includes URL change detection that reinitializes highlighting functionality when the page URL changes.

### Background Service Worker

The extension's background service worker handles data persistence, message routing, and tab tracking. It maintains a persistent record of all tabs that have been visited, storing this information in Chrome's local storage and periodically saving it to ensure persistence across extension restarts. This system prevents the extension from "forgetting" tabs that haven't been actively used recently. When tabs are activated, updated, or created, the extension ensures that content scripts are present and functional through a ping/pong mechanism that automatically re-injects them if missing. The tab tracking system includes periodic checks that verify content scripts are present in all tracked tabs.

### Data Storage and Selection Detection

All extension data is stored locally using Chrome's Storage API, ensuring that highlights and tags persist across browser sessions and extension updates. The storage structure includes separate keys for tags and highlights, with tags stored as an array of objects containing id, name, color, parentIds, and timestamp fields. Highlights are stored as an array of objects containing id, url, text, tags (array of tag IDs), note, timestamp, xpath, and optional isPdf flag. The storage system is designed to be efficient and scalable, with operations performed asynchronously.

MnemoMark implements a sophisticated multi-layered approach to text selection detection. For standard web pages, it uses event listeners that respond to mouseup, selectionchange, and keyup events. For PDF documents and dynamic content, it implements continuous polling that checks for selections at regular intervals (100ms for PDFs, 200ms for regular pages). The extension is designed to work seamlessly with modern web applications that use dynamic content loading, single-page application architectures, and asynchronous content updates through MutationObserver instances that watch for new content being added to pages.

## Use Cases and Applications

MnemoMark is particularly valuable for researchers, students, and academics who need to organize information from multiple sources. The hierarchical tagging system allows users to create taxonomies that reflect research domains, with tags organized by topic, methodology, source type, or any other organizational scheme. The ability to assign multiple parent tags means that research concepts can be categorized in multiple ways simultaneously. The note-taking capability enables users to add contextual information, citations, personal insights, or reminders directly to highlights.

For users engaged in continuous learning or content curation, MnemoMark provides a systematic way to capture and organize valuable information encountered during browsing. The floating button makes it effortless to highlight interesting content without interrupting the reading flow, while the tag system enables users to build a personal knowledge base organized by subject, skill level, or learning goals. Professionals can use MnemoMark to create organized knowledge repositories with search functionality that enables quick retrieval of specific information when needed.

## Installation and Setup

Installing MnemoMark is straightforward and requires no special technical knowledge. Users download or clone the extension directory, open Chrome's extension management page (chrome://extensions/), enable Developer mode, and click "Load unpacked" to select the extension folder. The extension immediately becomes available in the Chrome toolbar, ready to use. No additional configuration is required for basic functionality—users can start highlighting and creating tags immediately after installation. The extension works entirely offline using local storage. For users who want to enable cloud synchronization between the extension and desktop app, Firebase configuration is required, but this is completely optional—the extension functions fully without it.

## Performance and User Experience

MnemoMark is designed to minimize its impact on browser performance and system resources. Content scripts run at document_idle, ensuring they don't interfere with page loading. Selection polling uses optimized intervals that balance responsiveness with CPU usage, and the extension includes cleanup mechanisms that remove event listeners and observers when they're no longer needed. The storage system uses efficient data structures and asynchronous operations to avoid blocking the user interface, with tag and highlight data stored in flat arrays with indexed lookups for fast access times.

The extension's interface is designed with usability as a primary consideration. The floating button appears automatically when needed and disappears when not, requiring no user configuration. Modal dialogs include clear labels, helpful placeholder text, and intuitive button layouts. Color coding throughout the interface provides visual feedback and helps users quickly identify different types of information. All user actions receive immediate visual feedback, creating a polished, professional user experience.

## Integration and Compatibility

MnemoMark is designed to work across virtually all websites, with special handling for edge cases like PDFs, embedded content, and cross-origin resources. The extension uses Chrome's host_permissions to access all URLs, ensuring broad compatibility while maintaining security through Chrome's built-in content security policies. The extension handles various content types gracefully, with fallback mechanisms for content that cannot be directly accessed. MnemoMark is built for Chrome and other Chromium-based browsers that support Manifest V3, using standard Chrome APIs and following Chrome extension best practices to ensure compatibility with current and future Chrome versions.

## Conclusion

MnemoMark represents a comprehensive solution for web content highlighting and organization, combining ease of use with powerful organizational capabilities. Its floating button interface makes highlighting effortless, while its hierarchical tagging system provides the flexibility needed for complex information organization. The optional cloud synchronization extends functionality across devices, and the persistent tab tracking ensures reliable operation across browsing sessions. Whether used for research, learning, professional information management, or personal knowledge building, MnemoMark provides the tools needed to transform web browsing from passive consumption into active knowledge creation and organization.
