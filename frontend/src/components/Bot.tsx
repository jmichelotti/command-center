import { useRef, useEffect, useState } from "react";
import type { Zone, Space, BotType, BotState } from "../types/config";
import { polygonCentroid } from "./ZoneOverlay";

interface BotProps {
  zone: Zone;
  space: Space;
  botType: BotType;
  state: BotState;
}

export function Bot({ zone, space, botType, state }: BotProps) {
  const centroid = polygonCentroid(zone.polygon, space);
  const radius = (botType.placeholder.size / 100) * space.nativeWidth;
  const fontSize = space.nativeWidth * 0.008;
  const labelRef = useRef<SVGTextElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);

  const color = botType.colors[state];

  useEffect(() => {
    if (labelRef.current) {
      setLabelWidth(labelRef.current.getBBox().width);
    }
  }, [zone.name]);

  const pillPadX = fontSize * 0.6;
  const pillPadY = fontSize * 0.35;
  const pillWidth = labelWidth + pillPadX * 2;
  const pillHeight = fontSize + pillPadY * 2;
  const labelY = centroid.y - radius * 2.5;

  return (
    <g
      className={`bot bot-${state}`}
      style={{ "--bot-color": color } as React.CSSProperties}
    >
      {/* ambient glow */}
      <circle
        className="bot-glow"
        cx={centroid.x}
        cy={centroid.y}
        r={radius * 3}
        fill={color}
        opacity={0}
      />

      {/* label background pill */}
      {labelWidth > 0 && (
        <rect
          x={centroid.x - pillWidth / 2}
          y={labelY - pillHeight / 2}
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

      {/* zone name */}
      <text
        ref={labelRef}
        x={centroid.x}
        y={labelY}
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

      {/* outer ring */}
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

      {/* core circle */}
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

      {/* inner highlight */}
      <circle
        cx={centroid.x}
        cy={centroid.y}
        r={radius * 0.35}
        fill="rgba(255, 255, 255, 0.2)"
      />
    </g>
  );
}
