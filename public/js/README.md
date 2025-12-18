# JavaScript Module Organization

The JavaScript code is now organized into logical, focused directories for better maintainability and clarity.

## Directory Structure

```
js/
├── core/                 # Core application and infrastructure
│   ├── app.js           # Main application entry point
│   ├── logger.js        # Logging utility
│   └── error-handler.js # Global error handling
│
├── utils/               # Utility functions and helpers
│   ├── dom-utils.js     # DOM manipulation helpers
│   ├── config.js        # Configuration constants
│   ├── clipboard-utils.js # Clipboard operations
│   └── storage-manager.js # Local storage management
│
├── handlers/            # Event and request handlers
│   └── search-handler.js # Search form and API interaction
│
├── loaders/             # Resource loading and template management
│   ├── template-loader.js # HTML template loading
│   └── image-loader.js  # Image loading with skeleton states
│
├── components/          # UI components and renderers
│   ├── profile-renderer.js # Player profile rendering
│   ├── recent-section.js  # Recent searches display
│   ├── set-art-manager.js # Set art and modal management
│   └── special-pages.js  # Special pages (codes, all rewards)
│
└── features/            # Feature-specific modules
    ├── pwa-install.js   # PWA installation handling
    ├── ui-feedback.js   # UI feedback and loading states
    ├── url-state.js     # URL query state management
    └── reward-utils.js  # Reward processing and formatting
```

## Module Responsibilities

### Core (`js/core/`)
- **app.js**: Orchestrates module initialization and app startup
- **logger.js**: Provides logging functionality across the app
- **error-handler.js**: Sets up global error handlers for runtime and promise errors

### Utils (`js/utils/`)
- **dom-utils.js**: Cached DOM element references and manipulation helpers
- **config.js**: App configuration constants (debounce times, cache values, etc.)
- **clipboard-utils.js**: Clipboard copy functionality
- **storage-manager.js**: Local storage wrapper for recent users and seen sets

### Handlers (`js/handlers/`)
- **search-handler.js**: Search form submission, API calls, and result display logic

### Loaders (`js/loaders/`)
- **template-loader.js**: Loads and caches HTML templates from `/templates/`
- **image-loader.js**: Creates lazy-loading images with skeleton placeholders

### Components (`js/components/`)
- **profile-renderer.js**: Renders player profiles with sets, tiers, and rewards
- **recent-section.js**: Displays recently searched players
- **set-art-manager.js**: Manages set detail modal and art loading
- **special-pages.js**: Handles special pages (reward codes, all rewards)

### Features (`js/features/`)
- **pwa-install.js**: PWA install prompt and standalone mode handling
- **ui-feedback.js**: Loading states, error messages, and UI feedback
- **url-state.js**: URL query string parsing and state management
- **reward-utils.js**: Reward data processing and formatting helpers

## Import Guidelines

When importing modules, use relative paths from your current module:

```javascript
// From js/components/profile-renderer.js
import { logger } from '../core/logger.js';
import { loadTemplate } from '../loaders/template-loader.js';
import { escapeHtml } from '../features/reward-utils.js';
```

All imports use the `js/` prefix and explicit file extensions (`.js`) for ES module compatibility.
