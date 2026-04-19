import { useState, useEffect, useCallback } from "react";
import { useConfig } from "./hooks/useConfig";
import { useProjectStatus } from "./hooks/useProjectStatus";
import { SpaceView } from "./components/SpaceView";
import { CreateSpaceModal } from "./components/CreateSpaceModal";

export default function App() {
  const { config, loading, error, reload } = useConfig();
  const statuses = useProjectStatus(config ?? { spaces: [], botTypes: {}, dataSources: {} });
  const [activeIndex, setActiveIndex] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const cycleSpace = useCallback(
    (direction: 1 | -1) => {
      if (!config) return;
      setActiveIndex((i) => (i + direction + config.spaces.length) % config.spaces.length);
    },
    [config],
  );

  useEffect(() => {
    if (!config) return;

    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showCreate) return;

      const num = parseInt(e.key);
      if (num >= 1 && num <= config!.spaces.length) {
        setActiveIndex(num - 1);
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "[") cycleSpace(-1);
      if (e.key === "ArrowRight" || e.key === "]") cycleSpace(1);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config, cycleSpace, showCreate]);

  const handleSpaceCreated = useCallback(() => {
    reload();
    setShowCreate(false);
    if (config) {
      setActiveIndex(config.spaces.length);
    }
  }, [reload, config]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-text">INITIALIZING COMMAND CENTER...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="loading-screen">
        <div className="loading-text error">
          SYSTEM ERROR: {error ?? "Failed to load config"}
        </div>
      </div>
    );
  }

  if (config.spaces.length === 0) {
    return (
      <>
        <div className="loading-screen">
          <div className="loading-text">
            NO SPACES CONFIGURED
            <br />
            <button
              className="modal-btn modal-btn-create"
              style={{ marginTop: 16 }}
              onClick={() => setShowCreate(true)}
            >
              Create First Space
            </button>
          </div>
        </div>
        {showCreate && (
          <CreateSpaceModal
            onClose={() => setShowCreate(false)}
            onCreated={handleSpaceCreated}
          />
        )}
      </>
    );
  }

  return (
    <>
      {config.spaces.map((space, i) => (
        <div
          key={space.id}
          className={`space-layer ${i === activeIndex ? "space-layer-active" : ""}`}
        >
          <SpaceView space={space} config={config} statuses={statuses} onReloadConfig={reload} isActive={i === activeIndex} />
        </div>
      ))}

      <div className="view-switcher">
        {config.spaces.map((space, i) => (
          <button
            key={space.id}
            className={`view-tab ${i === activeIndex ? "view-tab-active" : ""}`}
            onClick={() => setActiveIndex(i)}
          >
            <span className="view-tab-key">{i + 1}</span>
            {space.name}
          </button>
        ))}
        <button
          className="view-tab view-tab-add"
          onClick={() => setShowCreate(true)}
          title="Create new space"
        >
          +
        </button>
      </div>

      {showCreate && (
        <CreateSpaceModal
          onClose={() => setShowCreate(false)}
          onCreated={handleSpaceCreated}
        />
      )}
    </>
  );
}
