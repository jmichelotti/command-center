import { useState, useRef, useCallback } from "react";
import type { Config } from "../types/config";

interface CreateZoneModalProps {
  spaceId: string;
  zoneName: string;
  polygon: [number, number][];
  config: Config;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateZoneModal({
  spaceId,
  zoneName,
  polygon,
  config,
  onClose,
  onCreated,
}: CreateZoneModalProps) {
  const [name, setName] = useState(zoneName);
  const [dataSource, setDataSource] = useState("");
  const [spriteMode, setSpriteMode] = useState<"existing" | "upload">("existing");
  const [existingBot, setExistingBot] = useState("");
  const [newBotName, setNewBotName] = useState("");
  const [spriteFile, setSpriteFile] = useState<File | null>(null);
  const [spritePreview, setSpritePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const existingBots = Object.entries(config.botTypes)
    .filter(([, bt]) => bt.sprite)
    .map(([key, bt]) => ({ key, label: bt.label, sprite: bt.sprite! }));

  const dataSources = Object.entries(config.dataSources).map(([key, ds]) => ({
    key,
    type: ds.type,
  }));

  const handleSpriteSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSpriteFile(file);
    setSpritePreview(URL.createObjectURL(file));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || polygon.length < 3) return;

    const botKey = spriteMode === "existing" ? existingBot : "";
    if (spriteMode === "existing" && !botKey) return;
    if (spriteMode === "upload" && (!newBotName.trim() || !spriteFile)) return;

    setSubmitting(true);
    setError("");

    const form = new FormData();
    form.append("zone_name", name.trim());
    form.append("polygon", JSON.stringify(polygon));
    if (dataSource) form.append("data_source", dataSource);

    if (spriteMode === "existing") {
      form.append("bot_type_key", botKey);
    } else {
      form.append("bot_name", newBotName.trim());
      form.append("bot_sprite", spriteFile!);
    }

    try {
      const res = await fetch(`/api/spaces/${spaceId}/zones`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to create zone");
      onCreated();
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }, [name, polygon, dataSource, spriteMode, existingBot, newBotName, spriteFile, spaceId, onCreated]);

  const canSubmit =
    name.trim() &&
    polygon.length >= 3 &&
    !submitting &&
    (spriteMode === "existing" ? !!existingBot : !!(newBotName.trim() && spriteFile));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">NEW ZONE</span>
          <button className="status-panel-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <label className="modal-label">
            Zone Name
            <input
              className="modal-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. StoryGraph Automation"
              autoFocus
            />
          </label>

          <div className="modal-label">
            Polygon
            <span className="modal-dims">{polygon.length} points</span>
          </div>

          <label className="modal-label">
            Data Source
            <span className="modal-optional">optional — assign later</span>
            <select
              className="modal-input"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
            >
              <option value="">None</option>
              {dataSources.map((ds) => (
                <option key={ds.key} value={ds.key}>
                  {ds.key} ({ds.type})
                </option>
              ))}
            </select>
          </label>

          <div className="modal-divider" />

          <div className="modal-label">
            Droid
            <div className="modal-toggle-group">
              <button
                className={`modal-toggle ${spriteMode === "existing" ? "modal-toggle-active" : ""}`}
                onClick={() => setSpriteMode("existing")}
              >
                Use Existing
              </button>
              <button
                className={`modal-toggle ${spriteMode === "upload" ? "modal-toggle-active" : ""}`}
                onClick={() => setSpriteMode("upload")}
              >
                Upload New
              </button>
            </div>
          </div>

          {spriteMode === "existing" ? (
            <div className="modal-bot-grid">
              {existingBots.map((bot) => (
                <button
                  key={bot.key}
                  className={`modal-bot-card ${existingBot === bot.key ? "modal-bot-card-selected" : ""}`}
                  onClick={() => setExistingBot(bot.key)}
                >
                  <img src={`/assets/${bot.sprite}`} alt={bot.label} />
                  <span>{bot.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <label className="modal-label">
                Droid Name
                <input
                  className="modal-input"
                  type="text"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g. Probe Droid"
                />
              </label>
              <label className="modal-label">
                Sprite Image
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png"
                  onChange={handleSpriteSelect}
                  style={{ display: "none" }}
                />
                <button
                  className="modal-upload-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  {spriteFile ? spriteFile.name : "Choose sprite..."}
                </button>
              </label>
              {spritePreview && (
                <div className="modal-preview modal-preview-sprite">
                  <img src={spritePreview} alt="Sprite preview" />
                </div>
              )}
            </>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn modal-btn-create"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? "Creating..." : "Create Zone"}
          </button>
        </div>
      </div>
    </div>
  );
}
