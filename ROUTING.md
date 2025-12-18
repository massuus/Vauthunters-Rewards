# Routing Configuration

This document explains how the application handles routing with the new folder structure.

## Problem

After reorganizing files into logical groups (`/pages`, `/data`, `/css`, etc.), the root path `/` was returning 404 errors, and requests were not being properly directed.

## Solution

### Files Created/Modified

1. **`functions/index.js`** - New Cloudflare Function
   - Handles root path `/` requests
   - Rewrites to `/pages/index.html`
   - Passes through all other requests to static file serving

2. **`public/_routes.json`** - Cloudflare Routes Configuration
   - Specifies which paths go through the Functions layer
   - Only root `/` goes through the function
   - Static assets are served directly:
     - `/css/*` - Stylesheets
     - `/js/*` - JavaScript modules
     - `/data/*` - JSON data files
     - `/templates/*` - HTML templates
     - `/img/*` - Image assets
   - Root files served directly:
     - `/manifest.json` - PWA manifest
     - `/sw.js` - Service worker

3. **`wrangler.toml`** - Updated Wrangler Configuration
   - Configured `[site]` with `bucket = "dist"` for static file serving
   - Enables automatic static file hosting

4. **`build.js`** - Updated Build Configuration
   - Copies `_routes.json` to dist folder during build
   - Updated HTML reference rewriting for proper script paths

## How It Works

```
User Request
    ↓
Is path = "/" ?
    ├─ YES → functions/index.js → Rewrite to /pages/index.html
    │                            → Static file serving
    │
    └─ NO → Check if static asset (/css, /js, /data, etc.)
            ├─ YES → Static file serving
            └─ NO → Treat as 404
```

## Local Development

When running locally with `wrangler dev`:
- The Cloudflare Functions are still available
- Static file serving works from the dist folder
- Navigation to `/` is routed to `/pages/index.html`

## Production Deployment

When deployed to Cloudflare Workers:
- The functions handle routing at the edge
- Static files are cached and served globally
- Zero-latency routing to the correct assets

## File Structure

```
dist/
├── _routes.json              # Route configuration
├── pages/
│   ├── index.html           # Served at root via function
│   └── offline.html
├── css/
├── js/
├── data/
├── templates/
├── img/
├── manifest.json
└── sw.js
```

## Testing Routes

After building, you can test:
- `http://localhost:8788/` → Should serve index.html
- `http://localhost:8788/pages/index.html` → Should serve directly
- `http://localhost:8788/css/main.css` → Should serve CSS
- `http://localhost:8788/js/core/app.js` → Should serve JavaScript
- `http://localhost:8788/data/set-art.json` → Should serve data
