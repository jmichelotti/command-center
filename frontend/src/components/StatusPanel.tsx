import type { BotState } from "../types/config";
import type { ProjectStatus } from "../hooks/useProjectStatus";

interface StatusPanelProps {
  zoneName: string;
  status: ProjectStatus;
  onClose: () => void;
}

function stateColor(state: BotState): string {
  switch (state) {
    case "active":
      return "#00ff88";
    case "error":
      return "#ff4444";
    case "idle":
      return "#4a6fa5";
  }
}

export function StatusPanel({ zoneName, status, onClose }: StatusPanelProps) {
  return (
    <div className="status-panel" onClick={(e) => e.stopPropagation()}>
      <div className="status-panel-scanlines" />

      <div className="status-panel-header">
        <div className="status-panel-title">
          <span
            className="status-panel-dot"
            style={{ background: stateColor(status.state) }}
          />
          {zoneName}
        </div>
        <span
          className="status-panel-badge"
          style={{
            color: stateColor(status.state),
            borderColor: stateColor(status.state),
          }}
        >
          {status.label}
        </span>
        <button className="status-panel-close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="status-panel-divider" />

      <div className="status-panel-body">
        {status.fields.map(({ key, value }, i) => (
          <div
            className="status-panel-row"
            key={key}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <span className="status-panel-key">{key}</span>
            <span className="status-panel-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="status-panel-footer">
        <span className="status-panel-timestamp">
          LAST UPDATED {new Date().toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </div>
    </div>
  );
}
