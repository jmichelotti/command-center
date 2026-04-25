# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Command Center

Personal dev project monitoring dashboard. A top-down Star Wars location image serves as the visual background, with different regions mapped to dev projects. Each project is represented by an animated bot whose behavior reflects real-time project status.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite (port 5180 dev)
- **Backend**: FastAPI + Python (port 8200)
- **Config format**: YAML
- **Containerization**: Docker Compose
- **Node**: v24 / npm 11
- **Python**: 3.12

## Architecture

### Config-Driven Rendering

The rendering engine is generic. It reads config files that define:
- **Spaces** — background images (e.g., Jabba's Palace)
- **Zones** — irregular polygon regions on the image (percentage-based coordinates)
- **Bots** — visual representations of projects (PNG droid sprites with zone patrol animation)
- **Data sources** — JSON status files written by external writer scripts

Adding a new project = write a status writer + define a zone polygon + assign a bot + point to a data source. New spaces and zones can also be created via the UI ("+", then debug overlay polygon tool).

### Common Analytics Format (File-Based)

All project integrations follow the same pattern:
1. A **writer script** runs in its own Docker container (or locally), polling the project's native API or reading its output files
2. The writer transforms the data into a common JSON format and writes it to `data/status/<project>.json`
3. The command center backend reads these JSON files via a single `FileAdapter` — no per-project adapter code

Common status JSON schema:
```json
{
  "project": "project-name",
  "updated_at": "2026-04-23T18:55:04+00:00",
  "state": "idle",
  "label": "NOMINAL",
  "fields": [
    {"key": "Field Name", "value": "field value"}
  ]
}
```

Adding a new project integration = write a new writer script (~50-100 lines) + add config entry. No changes to the command center backend.

### Custom Detail Views

Zones can have custom detail views instead of the default `StatusPanel`. Configured in `spaces.yaml` per zone:

```yaml
detailView:
  type: modal       # modal | page | panel
  component: storygraph  # key in the component registry
```

Architecture:
- `DetailViewContainer` — dispatcher that checks zone config, routes to custom view or falls back to `StatusPanel`
- `frontend/src/components/details/registry.ts` — maps component keys (e.g., `storygraph`) to React components
- `DetailModal` — modal shell with backdrop blur, Escape/click-outside close
- `DetailPage` — full-page overlay with back button

Adding a new custom detail view = create a React component implementing `DetailViewProps`, register it in `registry.ts`, set `detailView` in `spaces.yaml`.

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
│   ├── backgrounds/          # Background images
│   └── sprites/              # Droid PNG sprites
├── config/
│   └── spaces.yaml           # Spaces, zones, bots, data sources
├── data/
│   └── status/               # Writer output (gitignored)
│       ├── storygraph.json
│       └── jellyfin.json
├── frontend/                 # React + TypeScript + Vite
│   └── src/
│       ├── components/       # React components
│       │   └── details/      # Custom detail view components + registry
│       ├── hooks/            # Custom React hooks
│       └── types/            # TypeScript type definitions
├── backend/                  # FastAPI
│   ├── app.py                # Main FastAPI app
│   ├── config_loader.py      # YAML config parser
│   └── adapters/
│       └── file_adapter.py   # Reads status JSON files
├── writers/                  # Status writer scripts
│   ├── storygraph_writer.py  # Reads storygraph status.json
│   └── jellyfin_writer.py    # Polls Jellyfin API
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── TODO.md
└── CHANGELOG.md
```

## How to Run

### Docker (production)

```bash
cp .env.example .env          # edit with real values
docker compose up -d           # start all services
docker compose up -d --build   # rebuild after code changes
docker compose logs -f command-center  # tail logs
docker compose down            # stop everything
```

Services:
- `command-center` — backend + built frontend on port 8200
- `storygraph-writer` — reads storygraph status, writes to shared volume
- `jellyfin-writer` — polls Jellyfin API, writes to shared volume

All containers use `restart: unless-stopped` — survives reboots.

### Dev (hot-reload)

```bash
# Terminal 1 — Backend (from project root)
python3 -m backend.app

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev

# Terminal 3 — StoryGraph writer
JELLYFIN_API_KEY=<key> python3 writers/storygraph_writer.py

# Terminal 4 — Jellyfin writer
JELLYFIN_API_KEY=<key> python3 writers/jellyfin_writer.py
```

Frontend: http://localhost:5180 (Vite dev server, proxies API to backend)
Backend: http://localhost:8200

### Build & Lint

```bash
cd frontend && npm run build    # TypeScript check + Vite production build
cd frontend && npm run lint     # ESLint
```

## External Dependencies

### StoryGraph Automation — ~/dev/storygraph-automation
- **Runs via**: Docker (`docker compose up -d`)
- **Output**: `status/status.json` — per-profile run status, duration, books synced, in-progress audiobooks, next scheduled run
- **Profiles**: kim (Goodreads sync, hourly), justin (Audible sync, 2x daily)
- **Integration**: `storygraph-writer` reads this JSON file and transforms to common format

### Jellyfin Server — 192.168.4.74:8096
- **Location**: Windows machine (Dell OptiPlex) on local network, static IP via ethernet
- **Auth**: API key via `JELLYFIN_API_KEY` env var
- **Requires**: Playback Reporting plugin (provides SQL query endpoint for watch history)
- **Integration**: `jellyfin-writer` polls the Jellyfin API directly for server info, active sessions, library counts, and new episode detection (via TVmaze)

### Finance Dashboard — ~/dev/finance-dashboard (planned)
- **Runs via**: Docker Compose (port 5280 frontend, port 8001 API)
- **Integration**: Will write status JSON to `data/status/finance.json` after each sync cycle
- **Data to surface**: net worth, sync status per institution, account count, errors

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `JELLYFIN_HOST` | Jellyfin server IP | `192.168.4.74` |
| `JELLYFIN_PORT` | Jellyfin server port | `8096` |
| `JELLYFIN_API_KEY` | Jellyfin API key for auth | (required) |
| `STORYGRAPH_STATUS_PATH` | Path to storygraph status.json | `~/dev/storygraph-automation/status/status.json` |
| `STATUS_DIR` | Shared status JSON directory | `data/status/` (local) or `/data/status` (Docker) |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5180,http://localhost:5181` |
| `STALE_THRESHOLD_S` | Seconds before status is marked stale | `300` |
| `WRITER_INTERVAL` | Writer polling interval in seconds | `30` |
| `GAPS_INTERVAL` | Jellyfin episode gap check interval | `21600` (6 hours) |

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
| GET | `/api/status` | Read all status files, return zone statuses |
| POST | `/api/spaces` | Create new space (multipart: name, background image) |
| POST | `/api/spaces/{id}/zones` | Create zone with polygon + bot sprite |

## Design Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-18 | React + TS + Vite frontend | Config-driven component hierarchy (spaces > zones > bots > panels) benefits from React composition. |
| 2026-04-18 | FastAPI backend | Lowest friction. Enables future remote access. |
| 2026-04-18 | YAML config over database | No relational data. Config changes are infrequent and version-controllable. |
| 2026-04-18 | Irregular polygon zones | Background images have non-rectangular rooms. Percentage-based SVG polygons scale with viewport. |
| 2026-04-18 | 3 bot states (active/idle/error) | Combined idle+sleeping into single idle state — no clear UX distinction. |
| 2026-04-18 | One bot per project | StoryGraph bot aggregates both Kim and Justin profiles. Keeps the map clean. |
| 2026-04-18 | Sprite animation via direct DOM refs | rAF loop updates SVG transform attributes via refs — zero React re-renders during animation. |
| 2026-04-18 | Downscale large images over tiling | OpenSeadragon/tile pyramids are overkill when ~8000px wide images perform well. |
| 2026-04-18 | Left-click drag for pan | Right-click and middle-click have unavoidable browser side effects. Left-drag with 5px threshold cleanly separates pan from click. |
| 2026-04-18 | Single status polling loop | `useProjectStatus` runs in App, not per-SpaceView. One loop with `setTimeout` (not `setInterval`) prevents overlap. |
| 2026-04-23 | File-based common analytics format | Each project writes a status JSON file. Command center reads files via one generic adapter. Adding a new project = write a writer script + config entry. No per-project adapter code in the command center. |
| 2026-04-23 | Writer scripts in Docker containers | Each writer runs in its own container with `restart: unless-stopped`. Isolation, independent restart, shared status volume. |
| 2026-04-23 | Direct Jellyfin API over analytics proxy | Old setup used a separate analytics service (port 1201). New setup hits Jellyfin's native API directly at 192.168.4.74:8096. Eliminates the intermediary. |
| 2026-04-23 | TVmaze-based new episode detection | Queries Jellyfin Playback Reporting for recently-watched shows, filters to Continuing status, resolves to TVmaze IDs (via TVDB/IMDB), compares aired episodes against Jellyfin library. Only checks latest season + next. Runs every 6 hours, cached in status JSON. Ported from thunderhead/analytics. |
| 2026-04-24 | Pluggable detail views per zone | Default `StatusPanel` is too generic for rich data like StoryGraph profiles. Registry pattern maps config keys to React components. Three shells: modal (backdrop blur, Escape close), page (full overlay), panel (StatusPanel fallback). Config-driven via `detailView` in `spaces.yaml`. |
