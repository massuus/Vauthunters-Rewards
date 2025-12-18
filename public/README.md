# Public Folder Structure

The public folder is now organized into logical groups for better maintainability and clarity.

## Directory Organization

```
public/
├── css/                    # Stylesheets
│   ├── main.css           # Main CSS entry point
│   ├── styles.css         # Additional styles
│   ├── variables.css      # CSS custom properties and theme
│   ├── base.css           # Base/reset styles
│   ├── utilities.css      # Utility classes
│   └── components/        # Component-specific styles
│       ├── hero.css
│       ├── search.css
│       ├── footer.css
│       └── pwa-install.css
│
├── data/                  # JSON data files
│   ├── codes.json         # Reward codes data
│   └── set-art.json       # Set art definitions
│
├── img/                   # Image assets
│   ├── *.png, *.gif       # Item images
│   └── badge/             # Badge/tier images
│
├── js/                    # JavaScript modules
│   ├── core/              # Core app infrastructure
│   ├── utils/             # Utility functions
│   ├── handlers/          # Event handlers
│   ├── loaders/           # Resource loaders
│   ├── components/        # UI components
│   ├── features/          # Feature modules
│   └── README.md          # JS module documentation
│
├── pages/                 # HTML pages
│   ├── index.html         # Main application page
│   └── offline.html       # Offline fallback page
│
├── templates/             # HTML templates
│   ├── player-card.html
│   ├── set-card.html
│   ├── set-modal.html
│   ├── reward-group.html
│   ├── sets-section.html
│   ├── tiers-section.html
│   ├── recent-section.html
│   ├── extra-section.html
│   ├── loading-skeleton.html
│   └── sets-help.html
│
├── manifest.json          # PWA manifest (at root for standard location)
├── sw.js                  # Service worker (at root for scope)
├── _headers               # Cloudflare headers configuration
│
└── README.md (this file)
```

## Directory Purposes

### CSS (`css/`)
- **main.css**: Entry point importing all CSS modules
- **styles.css**: Additional/legacy styles
- **variables.css**: CSS custom properties and theme configuration
- **base.css**: Normalize and base element styles
- **utilities.css**: Utility classes for quick styling
- **components/**: Component-specific styles organized by UI section

### Data (`data/`)
- **codes.json**: Reward codes, descriptions, and VOD links
- **set-art.json**: Set definitions with item mappings and images

### Images (`img/`)
- Main game item images (PNG, GIF, WebP formats)
- Badge folder with tier/achievement badges
- Images are lazy-loaded for performance

### JavaScript (`js/`)
Organized into 6 logical modules with clear responsibilities. See [js/README.md](js/README.md) for details.

### Pages (`pages/`)
- **index.html**: Main application shell (loads app.js)
- **offline.html**: Offline fallback page served by service worker

### Templates (`templates/`)
- HTML template fragments loaded dynamically by the application
- Used for profile cards, modals, sections, and skeleton loaders
- Referenced by relative paths from the app

### Root Files
- **manifest.json**: PWA manifest (must be at root per standard)
- **sw.js**: Service worker (must be at root to have proper scope)
- **_headers**: Cloudflare-specific header configuration

## File References

All relative file paths have been updated to reflect the new structure:

| File Type | Old Path | New Path |
|-----------|----------|----------|
| HTML | `index.html` | `pages/index.html` |
| Offline page | `offline.html` | `pages/offline.html` |
| CSS | `main.css` | `css/main.css` |
| Codes data | `codes.json` | `data/codes.json` |
| Set art data | `set-art.json` | `data/set-art.json` |

References updated in:
- ✅ `pages/index.html` - CSS, manifest, and script paths
- ✅ `sw.js` - Static asset cache list and offline page path
- ✅ `js/utils/config.js` - Static assets cache list
- ✅ `js/components/special-pages.js` - Data URLs
- ✅ `js/components/set-art-manager.js` - Set art data URL
- ✅ `build.js` - Build configuration and output paths

## Service Worker & PWA

- `sw.js` remains at the root (required for service worker scope)
- `manifest.json` remains at the root (PWA standard location)
- Service worker caches files from new paths (e.g., `/pages/index.html`, `/data/set-art.json`)
- Offline page served from `/pages/offline.html`

## Build System

The build process (`build.js`) handles:
- ✅ Copying CSS from `css/` folder
- ✅ Copying `data/` folder with JSON files
- ✅ Copying `pages/` folder with HTML files
- ✅ Copying JS modules structure as-is
- ✅ Minifying CSS in production
- ✅ Bundling JS with esbuild

Run with: `node build.js`
