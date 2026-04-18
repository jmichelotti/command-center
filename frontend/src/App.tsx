import { useConfig } from "./hooks/useConfig";
import { SpaceView } from "./components/SpaceView";

export default function App() {
  const { config, loading, error, reload } = useConfig();

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

  const activeSpace = config.spaces[0];
  if (!activeSpace) {
    return (
      <div className="loading-screen">
        <div className="loading-text error">NO SPACES CONFIGURED</div>
      </div>
    );
  }

  return <SpaceView space={activeSpace} config={config} onReloadConfig={reload} />;
}
