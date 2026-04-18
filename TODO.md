# Command Center — TODO

## Phase 1 — Foundation
- [x] Project scaffolding (React + Vite frontend, FastAPI backend)
- [x] Config schema design and YAML loader
- [x] Background image rendering (fit-to-viewport, scrollable)
- [x] Zone polygon rendering (SVG overlay, percentage-based coordinates)
- [x] Debug overlay (zone boundaries, labels, coordinate click tool)
- [x] Bot placeholder placement at zone centroids

## Phase 2 — Bot State System
- [x] Bot component with state-driven animations (active/idle/error)
- [x] Mock data source cycling through states
- [x] Click/hover status panel (sci-fi terminal aesthetic)
- [x] Panel content driven by data source

## Phase 3 — Real Data Integration
- [x] StoryGraph adapter (poll port 1200 /status)
- [x] StoryGraph bot end-to-end with real data
- [x] Jellyfin adapter (poll port 1201 /status + /sessions)
- [x] Jellyfin bot end-to-end with real data

## Phase 4 — Polish & Multi-Space
- [ ] Refine sci-fi terminal panel UI
- [x] Multiple space support (tab bar, keyboard shortcuts, all spaces mounted simultaneously)
- [x] Pan/zoom canvas (scroll-wheel zoom, left-drag pan, fit-to-viewport on load)
- [x] Space creation UI (upload background, auto-detect dimensions)
- [x] Zone creation UI (debug polygon tool → Create Zone modal with sprite upload)
- [x] Sprite animation perf: rAF updates DOM via refs, zero React re-renders
- [x] Large image optimization: downscale backgrounds to ~8000px wide
- [ ] UX improvements from usage feedback
- [x] PNG sprite support for bots (R2-D2 for StoryGraph, C-3PO for ThunderheadFlix)
- [x] Zone patrol animation (droids wander within polygon, rotate to face heading)
