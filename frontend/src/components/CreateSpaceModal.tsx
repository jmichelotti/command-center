import { useState, useRef, useCallback } from "react";

interface CreateSpaceModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSpaceModal({ onClose, onCreated }: CreateSpaceModalProps) {
  const [name, setName] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [bgDims, setBgDims] = useState<{ w: number; h: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleBgSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgFile(file);
    const url = URL.createObjectURL(file);
    setBgPreview(url);
    const img = new Image();
    img.onload = () => {
      setBgDims({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !bgFile || !bgDims) return;
    setSubmitting(true);
    setError("");

    const form = new FormData();
    form.append("name", name.trim());
    form.append("native_width", String(bgDims.w));
    form.append("native_height", String(bgDims.h));
    form.append("background", bgFile);

    try {
      const res = await fetch("/api/spaces", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to create space");
      onCreated();
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }, [name, bgFile, bgDims, onCreated]);

  const canSubmit = name.trim() && bgFile && bgDims && !submitting;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">NEW SPACE</span>
          <button className="status-panel-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <label className="modal-label">
            Space Name
            <input
              className="modal-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Echo Base"
              autoFocus
            />
          </label>

          <label className="modal-label">
            Background Image
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              onChange={handleBgSelect}
              style={{ display: "none" }}
            />
            <button
              className="modal-upload-btn"
              onClick={() => bgInputRef.current?.click()}
            >
              {bgFile ? bgFile.name : "Choose image..."}
            </button>
            {bgDims && (
              <span className="modal-dims">{bgDims.w} x {bgDims.h}</span>
            )}
          </label>

          {bgPreview && (
            <div className="modal-preview">
              <img src={bgPreview} alt="Background preview" />
            </div>
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
            {submitting ? "Creating..." : "Create Space"}
          </button>
        </div>
      </div>
    </div>
  );
}
