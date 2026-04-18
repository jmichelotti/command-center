import { useState, useCallback } from "react";
import type { Space, Config } from "../types/config";
import { ZoneOverlay } from "./ZoneOverlay";
import { Bot } from "./Bot";
import { DebugPanel } from "./DebugPanel";
import { StatusPanel } from "./StatusPanel";
import { useProjectStatus } from "../hooks/useProjectStatus";

interface SpaceViewProps {
  space: Space;
  config: Config;
  onReloadConfig: () => void;
}

export function SpaceView({ space, config, onReloadConfig }: SpaceViewProps) {
  const [debug, setDebug] = useState(false);
  const [clicks, setClicks] = useState<[number, number][]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const statuses = useProjectStatus(config);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
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
    <div className="space-container">
      <div className="space-canvas">
        <img
          src={`/assets/${space.image}`}
          alt={space.name}
          className="space-image"
          draggable={false}
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
      />
    </div>
  );
}
