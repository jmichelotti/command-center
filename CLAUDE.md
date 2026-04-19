# Command Center

Personal dev project monitoring dashboard. A top-down Star Wars location image serves as the visual background, with different regions mapped to dev projects. Each project is represented by an animated bot whose behavior reflects real-time project status.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite (port 5180 dev)
- **Backend**: FastAPI + Python (port 8100)
- **Config format**: YAML
- **Node**: v24.12.0 / npm 11.6.2
- **Python**: 3.14.2

## Architecture

### Config-Driven Rendering

The rendering engine is generic. It reads config files that define:
- **Spaces** — background images (e.g., Jabba's Palace)
- **Zones** — irregular polygon regions on the image (percentage-based coordinates)
- **Bots** — visual representations of projects (PNG droid sprites with zone patrol animation)
- **Data sources** — APIs to poll for project status, with adapter types that know how to interpret responses

Adding a new project = define a zone polygon + assign a bot + point to a data source. No code changes needed for new instances of existing data source types. New spaces and zones can also be created via the UI ("+", then debug overlay polygon tool).

### Data Source Adapters

Each data source type has an adapter that knows how to:
1. Fetch data from the source API
2. Derive bot state (active/idle/error) from the response
3. Extract display fields for the status panel

Current adapter types:
- `storygraph` — polls StoryGraph dashboard API (port 1200)
- `jellyfin` — polls Jellyfin analytics API (port 1201), also fetches episode gaps via `/episodes/gaps` (background thread, 5-min cache)

### Bot States

| State | Meaning | Visual |
|-------|---------|--------|
| `active` | Automation running / streams active / missing episodes | Pulsing green glow |
| `idle` | Healthy, nothing happening | Dim steady state |
| `error` | Last run failed / unreachable | Flashing red |

## Directory Structure

```
command-center/
├── assets/
│   └── backgrounds/          # Background images
│       └── jabbas-palace.jpg # 3900x7500 top-down floor plan
├── config/                   # YAML config files
│   └── spaces.yaml           # Spaces, zones, bots, data sources
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── types/            # TypeScript type definitions
│   │   └── adapters/         # Data source adapter logic
│   └── ...
├── backend/                  # FastAPI
│   ├── app.py                # Main FastAPI app
│   ├── config_loader.py      # YAML config parser
│   └── adapters/             # Data source adapters (fetch + transform)
├── CLAUDE.md
├── TODO.md
└── CHANGELOG.md
```

## How to Run

### Dev (hot-reload)

```bash
# Terminal 1 — Backend (from project root)
python -m backend.app

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5180
Backend: http://localhost:8100 (hardcoded in backend/app.py, auto-kills zombie processes on startup)

## External Dependencies (existing services)

### StoryGraph Dashboard API — port 1200
- **Location**: C:\dev\StoryGraphAutomation\dashboard
- **Runs via**: Docker (`docker compose up -d dashboard`)
- **Key endpoint**: `GET /status` — returns per-profile run status, duration, applied books, next scheduled run, in-progress audiobooks
- **Profiles**: kim (Goodreads sync, hourly), justin (Audible sync, 2x daily)

### Jellyfin Analytics API — port 1201
- **Location**: C:\dev\thunderhead\analytics
- **Runs via**: Docker (`docker compose up -d` from `analytics/`), restart policy `unless-stopped`
- **Key endpoints**:
  - `GET /status` — server info, active sessions, library counts, storage
  - `GET /sessions` — real-time active streams with user, device, progress
  - `GET /playback/most-watched` — top content by play count
  - `GET /playback/currently-watching` — shows per user with latest episode
  - `GET /playback/hourly` — viewing heatmap data
  - `GET /playback/wrapped` — per-user annual summary
  - `GET /episodes/gaps` — missing episodes for tracked shows
- **Jellyfin server**: local network Dell OptiPlex, port 8096
- **Data**: 633+ playback events, 7 users, 12 devices, date range Feb-Apr 2026
- **Frontend exists**: Vanilla JS SPA at C:\dev\thunderhead\wrapped (dark cinematic theme)

## Navigation

- **Pan/zoom canvas**: CSS `transform: translate() scale()` on the canvas element (GPU-composited, no layout recalc)
- **Scroll wheel**: zoom toward cursor position
- **Left-click drag**: pan the map (5px threshold distinguishes drag from click)
- **Left click**: zone selection / debug polygon plotting
- **Tab bar**: switch between spaces (keyboard: 1-9 direct, [ ] to cycle)
- **Initial view**: image fit to viewport on first load, centered

## Background Images

- Images render at native dimensions; CSS transform handles sizing
- **Keep images under ~50M pixels** (~8000x6000) to avoid GPU memory lag spikes. The 21000x15000 Echo Base image caused periodic freezes until downscaled.
- Full-res backups stored as `*-full.jpg` in assets/backgrounds/ (gitignored)
- Zone polygons use percentage coordinates, so they scale to any image resolution

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Full YAML config as JSON |
| GET | `/api/status` | Poll all data sources, return zone statuses |
| POST | `/api/spaces` | Create new space (multipart: name, background image) |
| POST | `/api/spaces/{id}/zones` | Create zone with polygon + bot sprite |

## Design Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-18 | React + TS + Vite frontend | Config-driven component hierarchy (spaces > zones > bots > panels) benefits from React composition. User has React experience. |
| 2026-04-18 | FastAPI backend | Both existing data sources run FastAPI. Lowest friction. Enables future remote access. |
| 2026-04-18 | YAML config over database | No relational data. Config changes are infrequent and version-controllable. |
| 2026-04-18 | Irregular polygon zones | Background images have non-rectangular rooms. Percentage-based SVG polygons scale with viewport. |
| 2026-04-18 | 3 bot states (active/idle/error) | Combined idle+sleeping into single idle state — no clear UX distinction. |
| 2026-04-18 | One bot per project | StoryGraph bot aggregates both Kim and Justin profiles. Keeps the map clean. |
| 2026-04-18 | Data source adapter pattern | Different APIs have different shapes. Adapters provide a uniform interface. Adding a new instance of an existing type is config-only. New types need a small adapter. |
| 2026-04-18 | Poll existing APIs, don't rebuild | StoryGraph (port 1200) and Jellyfin (port 1201) already have exactly the data we need. |
| 2026-04-18 | Sprite animation via direct DOM refs | Calling React setState at 60fps per droid causes unnecessary re-renders. rAF loop updates SVG transform attributes via refs — zero React re-renders during animation. |
| 2026-04-18 | Downscale large images over tiling | OpenSeadragon/tile pyramids are overkill when ~8000px wide images perform well. Revisit if full-res zoom detail is needed. |
| 2026-04-18 | Left-click drag for pan | Right-click and middle-click have unavoidable browser side effects (context menus, new tabs). Left-drag with 5px threshold cleanly separates pan from click. |
| 2026-04-18 | Episode gaps via background thread | Jellyfin analytics API is single-threaded; the `/episodes/gaps` endpoint takes ~60s. Fetching it in the main request path blocks `/status`. A daemon thread fetches gaps independently with a 5-min cache. Status requests use a 5s timeout with cached fallback so they never block. |
| 2026-04-18 | Single status polling loop | `useProjectStatus` runs in App, not per-SpaceView. All spaces are mounted simultaneously — 3 independent polling loops caused request pileup. One loop with `setTimeout` (not `setInterval`) prevents overlap. |
