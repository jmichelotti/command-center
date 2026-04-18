# Command Center — Changelog

## 2026-04-18

### Session 1 — Phase 1 Complete
- Initialized git repo, set GitHub remote
- Copied Jabba's Palace background image (3900x7500) into assets/backgrounds/
- Created project documentation (CLAUDE.md, TODO.md, CHANGELOG.md)
- Explored existing data sources:
  - StoryGraph dashboard API (port 1200) — live, returning full status data
  - Jellyfin analytics API (port 1201) — live, 14 endpoints with playback data
- Decided on tech stack: React + TypeScript + Vite, FastAPI, YAML config
- Built Phase 1 — Foundation:
  - FastAPI backend (port 8080): serves YAML config as JSON, static assets
  - React frontend (port 5180): Vite with hot-reload, proxy to backend
  - Config schema: botTypes, dataSources, spaces with zones (YAML)
  - SpaceView component: renders background image at viewport width, scrollable
  - SVG overlay with percentage-based polygon zones (proper centroid calculation)
  - Bot placeholder circles positioned at zone centroids with labels
  - Debug overlay: togglable zone boundaries, click-to-plot polygon points, copy as YAML
  - TypeScript types matching config schema
- Built Phase 2 — Bot State System:
  - Three bot states: active (pulsing green), idle (breathing blue), error (flashing red)
  - CSS animations: glow rings, core pulse, ambient glow per state
  - Mock data provider: cycles bots through idle→active→idle→error with staggered timing
  - Status panel: sci-fi terminal with scan lines, slide-in animation, live-updating fields
  - Zone click selection: click a zone to open its status panel, click outside to dismiss
  - Panel shows state-specific data (different fields for running vs. nominal vs. fault)
  - Bot label redesigned: dark pill above circle, no overlap

### Session 2 — Phase 3 Complete
- Built StoryGraph adapter: polls port 1200 /status, derives bot state from profile run results
- Built Jellyfin adapter: polls port 1201 /status, derives bot state from server online + active streams
- Both bots now show real-time data in status panels (NOMINAL/ACTIVE/FAULT)
- Fixed backend port: hardcoded to 8100 with auto-kill of zombie processes on startup
- Vite proxy updated to target port 8100
- Jellyfin analytics service containerized in separate session (Docker, port 1201, unless-stopped)

### Session 3 — Droid Sprites & Zone Patrol
- Replaced placeholder circles with top-down droid PNG sprites (R2-D2, C-3PO)
- Zone patrol system: droids pick random waypoints inside their polygon and walk between them
- Smooth directional rotation: droids turn to face heading with shortest-path angle interpolation
- Eased movement (cubic ease-in-out) with random pauses between legs
- State-aware sprite effects: drop-shadow glow for active, flash for error
- C-3PO sized larger (6.5%) than R2-D2 (5%) to match visual weight

### Session 4 — Multi-Space, Pan/Zoom, Creation UI, Performance
- Multi-space view system: all spaces mounted simultaneously, tab bar with keyboard shortcuts (1-9, [, ])
- Pan/zoom canvas: scroll-wheel zoom toward cursor, left-click drag to pan, fit-to-viewport on load
- Space creation UI: "+" button opens modal, upload background image, auto-detect dimensions
- Zone creation UI: debug overlay polygon tool → "Create Zone" button → modal with droid picker (existing or upload new sprite)
- Backend endpoints: POST /api/spaces, POST /api/spaces/{id}/zones (multipart with image upload)
- Backend restart fix: _kill_port uses Stop-Process instead of taskkill (resolves bash slash issues)
- Sprite animation performance: refactored from React state (60 re-renders/sec/droid) to direct DOM manipulation via refs (zero re-renders)
- Image optimization: downscaled Echo Base from 21000x15000 (315M px) to 8000x5714 (46M px), eliminated GPU lag spikes
- Loading indicator: "RENDERING..." text shown while large background images decode
- python-multipart added to backend requirements for file upload support
