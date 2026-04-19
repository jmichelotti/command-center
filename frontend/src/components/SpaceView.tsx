import { useState, useCallback, useRef, useEffect } from "react";
import type { Space, Config } from "../types/config";
import { ZoneOverlay } from "./ZoneOverlay";
import { Bot } from "./Bot";
import { DebugPanel } from "./DebugPanel";
import { StatusPanel } from "./StatusPanel";
import { CreateZoneModal } from "./CreateZoneModal";
import type { ProjectStatus } from "../hooks/useProjectStatus";

interface SpaceViewProps {
  space: Space;
  config: Config;
  statuses: Record<string, ProjectStatus>;
  onReloadConfig: () => void;
  isActive: boolean;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;
const ZOOM_SPEED = 0.001;

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

function fitToViewport(nativeW: number, nativeH: number): ViewState {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scaleX = vw / nativeW;
  const scaleY = vh / nativeH;
  const zoom = Math.min(scaleX, scaleY);
  return {
    zoom,
    panX: (vw - nativeW * zoom) / 2,
    panY: (vh - nativeH * zoom) / 2,
  };
}

export function SpaceView({ space, config, statuses, onReloadConfig, isActive }: SpaceViewProps) {
  const [debug, setDebug] = useState(false);
  const [clicks, setClicks] = useState<[number, number][]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [pendingZoneName, setPendingZoneName] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewState>({ zoom: 1, panX: 0, panY: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const isPanning = useRef(false);
  const didDrag = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const DRAG_THRESHOLD = 5;

  function applyTransform() {
    if (!canvasRef.current) return;
    const { zoom, panX, panY } = viewRef.current;
    canvasRef.current.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // Fit to viewport on first activation after image loads
  useEffect(() => {
    if (!imageLoaded || !isActive || initialized.current) return;
    initialized.current = true;
    viewRef.current = fitToViewport(space.nativeWidth, space.nativeHeight);
    applyTransform();
  }, [imageLoaded, isActive, space.nativeWidth, space.nativeHeight]);

  // Wheel zoom toward cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = viewRef.current;
      const rect = container!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = -e.deltaY * ZOOM_SPEED;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * (1 + delta)));
      const scale = newZoom / v.zoom;
      v.panX = mouseX - (mouseX - v.panX) * scale;
      v.panY = mouseY - (mouseY - v.panY) * scale;
      v.zoom = newZoom;
      applyTransform();
    }

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  // Left-click drag to pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      isPanning.current = true;
      didDrag.current = false;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      dragStart.current = { x: e.clientX, y: e.clientY };
    }

    function onMouseMove(e: MouseEvent) {
      if (!isPanning.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };

      const totalDx = e.clientX - dragStart.current.x;
      const totalDy = e.clientY - dragStart.current.y;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag.current = true;
        container!.style.cursor = "grabbing";
      }

      if (didDrag.current) {
        viewRef.current.panX += dx;
        viewRef.current.panY += dy;
        applyTransform();
      }
    }

    function onMouseUp() {
      isPanning.current = false;
      container!.style.cursor = "";
    }

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (didDrag.current) return;
      if (!debug) {
        setSelectedZoneId(null);
        return;
      }
      const svg = e.currentTarget;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const xPct = (svgPt.x / space.nativeWidth) * 100;
      const yPct = (svgPt.y / space.nativeHeight) * 100;
      setClicks((prev) => [...prev, [xPct, yPct]]);
    },
    [debug, space]
  );

  const handleZoneSelect = useCallback((zoneId: string) => {
    setSelectedZoneId((prev) => (prev === zoneId ? null : zoneId));
  }, []);

  const handleCreateZone = useCallback((name: string) => {
    setPendingZoneName(name);
    setShowCreateZone(true);
  }, []);

  const handleZoneCreated = useCallback(() => {
    setShowCreateZone(false);
    setClicks([]);
    setPendingZoneName("");
    onReloadConfig();
  }, [onReloadConfig]);

  const selectedZone = selectedZoneId
    ? space.zones.find((z) => z.id === selectedZoneId)
    : null;

  const previewPoints =
    clicks.length >= 2
      ? clicks
          .map(([xPct, yPct]) => {
            const x = (xPct / 100) * space.nativeWidth;
            const y = (yPct / 100) * space.nativeHeight;
            return `${x},${y}`;
          })
          .join(" ")
      : null;

  return (
    <div className="space-container" ref={containerRef}>
      {!imageLoaded && (
        <div className="space-loading">
          <div className="loading-text">RENDERING {space.name.toUpperCase()}...</div>
        </div>
      )}

      <div
        className="space-canvas"
        ref={canvasRef}
        style={{ opacity: imageLoaded ? 1 : 0 }}
      >
        <img
          src={`/assets/${space.image}`}
          alt={space.name}
          className="space-image"
          draggable={false}
          onLoad={() => setImageLoaded(true)}
        />
        <svg
          className="space-overlay"
          viewBox={`0 0 ${space.nativeWidth} ${space.nativeHeight}`}
          preserveAspectRatio="xMidYMin meet"
          onClick={handleSvgClick}
        >
          <rect
            x={0}
            y={0}
            width={space.nativeWidth}
            height={space.nativeHeight}
            fill="transparent"
            style={{ pointerEvents: "all" }}
          />
          {space.zones.map((zone) => (
            <ZoneOverlay
              key={zone.id}
              zone={zone}
              space={space}
              debug={debug}
              selected={zone.id === selectedZoneId}
              onSelect={handleZoneSelect}
              isDragging={() => didDrag.current}
            />
          ))}
          {space.zones.map((zone) => {
            const botType = config.botTypes[zone.bot];
            if (!botType) return null;
            const status = statuses[zone.id];
            return (
              <Bot
                key={zone.id}
                zone={zone}
                space={space}
                botType={botType}
                state={status?.state ?? "idle"}
              />
            );
          })}

          {debug && previewPoints && (
            <polygon
              points={previewPoints}
              fill="rgba(255, 0, 255, 0.1)"
              stroke="#ff00ff"
              strokeWidth={3}
              strokeDasharray="8 4"
              style={{ pointerEvents: "none" }}
            />
          )}

          {debug &&
            clicks.map(([xPct, yPct], i) => {
              const x = (xPct / 100) * space.nativeWidth;
              const y = (yPct / 100) * space.nativeHeight;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={12} fill="#ff00ff" opacity={0.9} />
                  <text
                    x={x + 18}
                    y={y + 5}
                    fill="#ff00ff"
                    fontSize={24}
                    fontFamily="monospace"
                    fontWeight="bold"
                    style={{ pointerEvents: "none" }}
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {selectedZone && statuses[selectedZone.id] && (
        <StatusPanel
          zoneName={selectedZone.name}
          status={statuses[selectedZone.id]}
          onClose={() => setSelectedZoneId(null)}
        />
      )}

      <DebugPanel
        enabled={debug}
        onToggle={() => setDebug((d) => !d)}
        clicks={clicks}
        onClear={() => setClicks([])}
        onReloadConfig={onReloadConfig}
        onUndoClick={() => setClicks((prev) => prev.slice(0, -1))}
        onCreateZone={handleCreateZone}
      />

      {showCreateZone && (
        <CreateZoneModal
          spaceId={space.id}
          zoneName={pendingZoneName}
          polygon={clicks.map(([x, y]) => [
            parseFloat(x.toFixed(1)),
            parseFloat(y.toFixed(1)),
          ])}
          config={config}
          onClose={() => setShowCreateZone(false)}
          onCreated={handleZoneCreated}
        />
      )}
    </div>
  );
}
