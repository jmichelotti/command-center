import { useState } from "react";

interface DebugPanelProps {
  enabled: boolean;
  onToggle: () => void;
  clicks: [number, number][];
  onClear: () => void;
  onReloadConfig: () => void;
  onUndoClick: () => void;
  onCreateZone: (name: string) => void;
}

export function DebugPanel({
  enabled,
  onToggle,
  clicks,
  onClear,
  onReloadConfig,
  onUndoClick,
  onCreateZone,
}: DebugPanelProps) {
  const [zoneName, setZoneName] = useState("");
  const [copied, setCopied] = useState(false);

  const zoneId = zoneName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const copyAsYaml = () => {
    const indent = "          ";
    const polygonLines = clicks
      .map(([x, y]) => `${indent}- [${x.toFixed(1)}, ${y.toFixed(1)}]`)
      .join("\n");

    const name = zoneName || "Unnamed Zone";
    const id = zoneId || "unnamed-zone";

    const yaml = [
      `      - id: ${id}`,
      `        name: "${name}"`,
      `        polygon:`,
      polygonLines,
      `        bot: droid`,
      `        dataSource: storygraph`,
    ].join("\n");

    navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    onClear();
    setZoneName("");
  };

  const handleCreateZone = () => {
    onCreateZone(zoneName || "Unnamed Zone");
  };

  return (
    <div className="debug-panel">
      <label className="debug-toggle">
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <span>Debug overlay</span>
      </label>

      {enabled && (
        <div className="debug-info">
          <button className="debug-reload" onClick={onReloadConfig}>
            Reload Config
          </button>

          <div className="debug-zone-name">
            <label>Zone name</label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="e.g. StoryGraph Automation"
            />
            {zoneName && (
              <div className="debug-zone-id">id: {zoneId}</div>
            )}
          </div>

          <p className="debug-hint">Click image to plot polygon points</p>

          {clicks.length > 0 && (
            <>
              <div className="debug-points">
                {clicks.map(([x, y], i) => (
                  <div key={i} className="debug-point">
                    {i + 1}. [{x.toFixed(1)}, {y.toFixed(1)}]
                  </div>
                ))}
              </div>
              <div className="debug-actions">
                {clicks.length >= 3 && (
                  <button className="debug-create-zone" onClick={handleCreateZone}>
                    Create Zone
                  </button>
                )}
                <button onClick={copyAsYaml}>
                  {copied ? "Copied!" : "Copy YAML"}
                </button>
                <button onClick={onUndoClick}>Undo</button>
                <button onClick={handleClear}>Clear</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
