import type { Zone, Space } from "../types/config";

interface ZoneOverlayProps {
  zone: Zone;
  space: Space;
  debug: boolean;
  selected: boolean;
  onSelect: (zoneId: string) => void;
}

export function ZoneOverlay({ zone, space, debug, selected, onSelect }: ZoneOverlayProps) {
  const points = zone.polygon
    .map(([xPct, yPct]) => {
      const x = (xPct / 100) * space.nativeWidth;
      const y = (yPct / 100) * space.nativeHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(zone.id);
  };

  return (
    <polygon
      points={points}
      fill={
        selected
          ? "rgba(0, 255, 136, 0.12)"
          : debug
            ? "rgba(0, 255, 136, 0.05)"
            : "transparent"
      }
      stroke={
        selected
          ? "#00ff88"
          : debug
            ? "rgba(0, 255, 136, 0.5)"
            : "transparent"
      }
      strokeWidth={selected ? 4 : debug ? 2 : 0}
      strokeDasharray={debug && !selected ? "16 8" : undefined}
      style={{ cursor: "pointer" }}
      onClick={handleClick}
    />
  );
}

export function polygonCentroid(
  polygon: [number, number][],
  space: Space
): { x: number; y: number } {
  const n = polygon.length;
  if (n === 0) return { x: 0, y: 0 };

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = polygon[i][0] * polygon[j][1] - polygon[j][0] * polygon[i][1];
    area += cross;
    cx += (polygon[i][0] + polygon[j][0]) * cross;
    cy += (polygon[i][1] + polygon[j][1]) * cross;
  }

  area /= 2;

  if (Math.abs(area) < 1e-10) {
    const avgX = polygon.reduce((s, p) => s + p[0], 0) / n;
    const avgY = polygon.reduce((s, p) => s + p[1], 0) / n;
    return {
      x: (avgX / 100) * space.nativeWidth,
      y: (avgY / 100) * space.nativeHeight,
    };
  }

  cx /= 6 * area;
  cy /= 6 * area;

  return {
    x: (cx / 100) * space.nativeWidth,
    y: (cy / 100) * space.nativeHeight,
  };
}
