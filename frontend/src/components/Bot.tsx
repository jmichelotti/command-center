import { useRef, useEffect, useState, useCallback } from "react";
import type { Zone, Space, BotType, BotState } from "../types/config";
import { polygonCentroid } from "./ZoneOverlay";

interface BotProps {
  zone: Zone;
  space: Space;
  botType: BotType;
  state: BotState;
}

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function randomPointInPolygon(
  poly: [number, number][],
  space: Space,
  rng: () => number,
  margin: number,
): { x: number; y: number } {
  const svgPoly = poly.map(([xPct, yPct]) => [
    (xPct / 100) * space.nativeWidth,
    (yPct / 100) * space.nativeHeight,
  ] as [number, number]);

  const xs = svgPoly.map((p) => p[0]);
  const ys = svgPoly.map((p) => p[1]);
  const minX = Math.min(...xs) + margin;
  const maxX = Math.max(...xs) - margin;
  const minY = Math.min(...ys) + margin;
  const maxY = Math.max(...ys) - margin;

  for (let attempt = 0; attempt < 100; attempt++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (pointInPolygon(x, y, svgPoly)) {
      return { x, y };
    }
  }
  const cx = svgPoly.reduce((s, p) => s + p[0], 0) / svgPoly.length;
  const cy = svgPoly.reduce((s, p) => s + p[1], 0) / svgPoly.length;
  return { x: cx, y: cy };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function headingDeg(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI) - 90;
}

function shortestAngle(from: number, to: number): number {
  return ((to - from) % 360 + 540) % 360 - 180;
}

function useZonePatrol(
  zone: Zone,
  space: Space,
  spriteSize: number,
  groupRef: React.RefObject<SVGGElement | null>,
  spriteRef: React.RefObject<SVGImageElement | null>,
) {
  const rngRef = useRef(seededRandom(zone.id + "_patrol"));
  const margin = spriteSize * 0.4;

  const pickWaypoint = useCallback(() => {
    return randomPointInPolygon(zone.polygon, space, rngRef.current, margin);
  }, [zone.polygon, space, margin]);

  useEffect(() => {
    const rng = rngRef.current;
    const centroid = polygonCentroid(zone.polygon, space);
    let animId: number;
    let startTime: number;
    let from = { x: centroid.x, y: centroid.y };
    let to = pickWaypoint();
    let duration = 4000 + rng() * 6000;
    let pauseUntil = 0;

    let currentRotation = 0;
    let rotationFrom = 0;
    let rotationTo = shortestAngle(0, headingDeg(from, to));
    const turnDuration = 600;
    let turnStart = 0;

    // Set initial position
    if (groupRef.current) {
      groupRef.current.setAttribute("transform", `translate(${from.x}, ${from.y})`);
    }

    function tick(now: number) {
      if (!startTime) {
        startTime = now;
        turnStart = now;
      }

      if (now < pauseUntil) {
        animId = requestAnimationFrame(tick);
        return;
      }

      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(t);

      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased;

      const turnElapsed = now - turnStart;
      const turnT = Math.min(turnElapsed / turnDuration, 1);
      const turnEased = easeInOutCubic(turnT);
      currentRotation = rotationFrom + (rotationTo - rotationFrom) * turnEased;

      // Direct DOM updates — no React re-render
      if (groupRef.current) {
        groupRef.current.setAttribute("transform", `translate(${x}, ${y})`);
      }
      if (spriteRef.current) {
        spriteRef.current.setAttribute("transform", `rotate(${currentRotation})`);
      }

      if (t >= 1) {
        from = { x: to.x, y: to.y };
        to = pickWaypoint();
        duration = 4000 + rng() * 6000;
        startTime = now;
        const pause = rng() * 2000;
        pauseUntil = now + pause;

        rotationFrom = currentRotation;
        rotationTo = currentRotation + shortestAngle(currentRotation, headingDeg(from, to));
        turnStart = now + pause;
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [pickWaypoint, groupRef, spriteRef, zone.polygon, space]);
}

export function Bot({ zone, space, botType, state }: BotProps) {
  const centroid = polygonCentroid(zone.polygon, space);
  const size = (botType.placeholder.size / 100) * space.nativeWidth;
  const radius = size / 2;
  const fontSize = space.nativeWidth * 0.008;
  const labelRef = useRef<SVGTextElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);

  const color = botType.colors[state];
  const hasSprite = !!botType.sprite;

  // Refs for direct DOM manipulation — no React re-renders during animation
  const groupRef = useRef<SVGGElement>(null);
  const spriteRef = useRef<SVGImageElement>(null);

  useZonePatrol(zone, space, size, groupRef, spriteRef);

  useEffect(() => {
    if (labelRef.current) {
      setLabelWidth(labelRef.current.getBBox().width);
    }
  }, [zone.name]);

  const pillPadX = fontSize * 0.6;
  const pillPadY = fontSize * 0.35;
  const pillWidth = labelWidth + pillPadX * 2;
  const pillHeight = fontSize + pillPadY * 2;
  const labelOffsetY = hasSprite ? -size * 0.65 : -radius * 2.5;

  if (hasSprite) {
    // Sprite bot: everything rendered at origin, <g> is translated by rAF
    return (
      <g
        className={`bot bot-${state}`}
        style={{ "--bot-color": color } as React.CSSProperties}
      >
        <g ref={groupRef}>
          <circle
            className="bot-glow"
            cx={0}
            cy={0}
            r={size * 1.2}
            fill={color}
            opacity={0}
          />

          {labelWidth > 0 && (
            <rect
              x={-pillWidth / 2}
              y={labelOffsetY - pillHeight / 2}
              width={pillWidth}
              height={pillHeight}
              rx={pillHeight / 2}
              fill="rgba(10, 10, 15, 0.85)"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.6}
              className="bot-pill"
            />
          )}

          <text
            ref={labelRef}
            x={0}
            y={labelOffsetY}
            fill="rgba(255, 255, 255, 0.9)"
            fontSize={fontSize}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="monospace"
            fontWeight="bold"
            letterSpacing={1}
          >
            {zone.name}
          </text>

          <circle
            className="bot-ring"
            cx={0}
            cy={0}
            r={size * 0.55}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={0.15}
          />

          <image
            ref={spriteRef}
            className="bot-sprite"
            href={`/assets/${botType.sprite}`}
            x={-size / 2}
            y={-size / 2}
            width={size}
            height={size}
          />
        </g>
      </g>
    );
  }

  // Fallback: static circle bot (no animation)
  return (
    <g
      className={`bot bot-${state}`}
      style={{ "--bot-color": color } as React.CSSProperties}
    >
      <circle
        className="bot-glow"
        cx={centroid.x}
        cy={centroid.y}
        r={size * 1.2}
        fill={color}
        opacity={0}
      />

      {labelWidth > 0 && (
        <rect
          x={centroid.x - pillWidth / 2}
          y={centroid.y + labelOffsetY - pillHeight / 2}
          width={pillWidth}
          height={pillHeight}
          rx={pillHeight / 2}
          fill="rgba(10, 10, 15, 0.85)"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          className="bot-pill"
        />
      )}

      <text
        ref={labelRef}
        x={centroid.x}
        y={centroid.y + labelOffsetY}
        fill="rgba(255, 255, 255, 0.9)"
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="monospace"
        fontWeight="bold"
        letterSpacing={1}
      >
        {zone.name}
      </text>

      <circle
        className="bot-ring"
        cx={centroid.x}
        cy={centroid.y}
        r={radius * 1.6}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.2}
      />

      <circle
        className="bot-core"
        cx={centroid.x}
        cy={centroid.y}
        r={radius}
        fill={color}
        fillOpacity={0.85}
        stroke="rgba(255, 255, 255, 0.2)"
        strokeWidth={2}
      />

      <circle
        cx={centroid.x}
        cy={centroid.y}
        r={radius * 0.35}
        fill="rgba(255, 255, 255, 0.2)"
      />
    </g>
  );
}
