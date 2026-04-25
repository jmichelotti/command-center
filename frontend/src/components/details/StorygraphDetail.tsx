import type { DetailViewProps } from "./registry";
import type { BotState } from "../../types/config";

interface ProfileData {
  name: string;
  status: string;
  lastRun: string;
  synced: string;
  totalSynced: string;
  nextRun: string;
  inProgressCount: string;
  latestBook: string;
}

function parseProfiles(fields: { key: string; value: string }[]): ProfileData[] {
  const profiles: ProfileData[] = [];
  let current: ProfileData | null = null;

  for (const { key, value } of fields) {
    const trimmed = key.trim();
    if (!key.startsWith("  ") && trimmed !== "") {
      if (current) profiles.push(current);
      current = {
        name: trimmed,
        status: value,
        lastRun: "",
        synced: "",
        totalSynced: "",
        nextRun: "",
        inProgressCount: "",
        latestBook: "",
      };
    } else if (current) {
      switch (trimmed) {
        case "Last Run":
          current.lastRun = value;
          break;
        case "Synced":
          current.synced = value;
          break;
        case "Total Synced":
          current.totalSynced = value;
          break;
        case "Next Run":
          current.nextRun = value;
          break;
        case "In Progress":
          current.inProgressCount = value;
          break;
        case "Latest":
          current.latestBook = value;
          break;
      }
    }
  }
  if (current) profiles.push(current);
  return profiles;
}

function parseStatusParts(value: string): { state: string; duration: string } {
  const match = value.match(/^(\w+)\s*(?:\((.+)\))?$/);
  return {
    state: match?.[1] ?? value,
    duration: match?.[2] ?? "",
  };
}

function profileStateColor(state: string): string {
  switch (state.toUpperCase()) {
    case "SUCCESS":
      return "#00ff88";
    case "RUNNING":
      return "#ffaa00";
    default:
      return "#ff4444";
  }
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

function formatTime(isoString: string): string {
  if (!isoString || isoString === "N/A") return "N/A";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      const timeMatch = isoString.match(/^(\d{2}:\d{2}:\d{2})/);
      if (timeMatch) return timeMatch[1];
      return isoString;
    }
    return date.toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return isoString;
  }
}

function parseLatestBook(value: string): { title: string; percent: number } | null {
  const match = value.match(/^(.+?)\s*\((\d+)%\)$/);
  if (!match) return null;
  return { title: match[1], percent: parseInt(match[2]) };
}

export function StorygraphDetail({ zone, status, onClose }: DetailViewProps) {
  const profiles = parseProfiles(status.fields);
  const accentColor = stateColor(status.state);

  const allInProgress = profiles
    .filter((p) => p.latestBook)
    .map((p) => ({
      profile: p.name,
      ...parseLatestBook(p.latestBook)!,
    }))
    .filter((b) => b.title);

  return (
    <div className="sg-detail" onClick={(e) => e.stopPropagation()}>
      <div className="sg-scanlines" />

      <div className="sg-header">
        <div className="sg-header-left">
          <span className="sg-dot" style={{ background: accentColor }} />
          <span className="sg-title">{zone.name}</span>
        </div>
        <span
          className="sg-badge"
          style={{ color: accentColor, borderColor: accentColor }}
        >
          {status.label}
        </span>
        <button className="sg-close" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="sg-divider" />

      <div className="sg-body">
        <div className="sg-section">
          <div className="sg-section-label">PROFILES</div>
          <div className="sg-profiles">
            {profiles.map((profile, i) => {
              const { state, duration } = parseStatusParts(profile.status);
              const color = profileStateColor(state);
              return (
                <div
                  className="sg-profile-card"
                  key={profile.name}
                  style={{
                    animationDelay: `${i * 0.08}s`,
                    borderColor: `${color}33`,
                  }}
                >
                  <div className="sg-profile-header">
                    <span className="sg-profile-name">{profile.name}</span>
                    <span className="sg-profile-status" style={{ color }}>
                      <span className="sg-profile-dot" style={{ background: color }} />
                      {state}
                    </span>
                  </div>
                  {duration && (
                    <div className="sg-profile-duration">{duration}</div>
                  )}
                  <div className="sg-profile-stats">
                    <div className="sg-stat">
                      <span className="sg-stat-label">Last Run</span>
                      <span className="sg-stat-value">
                        {formatTime(profile.lastRun)}
                      </span>
                    </div>
                    {profile.synced && (
                      <div className="sg-stat">
                        <span className="sg-stat-label">Synced</span>
                        <span className="sg-stat-value">{profile.synced}</span>
                      </div>
                    )}
                    {profile.totalSynced && (
                      <div className="sg-stat">
                        <span className="sg-stat-label">Total</span>
                        <span className="sg-stat-value">
                          {profile.totalSynced}
                        </span>
                      </div>
                    )}
                    {profile.nextRun && (
                      <div className="sg-stat">
                        <span className="sg-stat-label">Next Run</span>
                        <span className="sg-stat-value">{formatTime(profile.nextRun)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sg-section" style={{ animationDelay: "0.2s" }}>
          <div className="sg-section-label">RECENT BOOKS</div>
          <div className="sg-books-grid">
            {[1, 2, 3, 4, 5].map((i) => (
              <div className="sg-book-slot" key={i}>
                <div className="sg-book-cover">
                  <div className="sg-book-placeholder">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                    >
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                  </div>
                </div>
                <span className="sg-book-title">---</span>
              </div>
            ))}
          </div>
          <div className="sg-awaiting-data">
            Awaiting cover data from writer
          </div>
        </div>

        {allInProgress.length > 0 && (
          <div className="sg-section" style={{ animationDelay: "0.3s" }}>
            <div className="sg-section-label">IN PROGRESS</div>
            {allInProgress.map((book) => (
              <div className="sg-progress-item" key={book.title}>
                <div className="sg-progress-info">
                  <span className="sg-progress-profile">{book.profile}</span>
                  <span className="sg-progress-title">{book.title}</span>
                  <span className="sg-progress-pct">{book.percent}%</span>
                </div>
                <div className="sg-progress-bar">
                  <div
                    className="sg-progress-fill"
                    style={{ width: `${book.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sg-section" style={{ animationDelay: "0.4s" }}>
          <div className="sg-section-label">ACTIVITY</div>
          <div className="sg-activity-placeholder">
            <div className="sg-sparkline">
              {[3, 5, 2, 7, 4, 6, 3, 8, 5, 2, 4, 6, 3, 5, 7, 4, 2, 5, 3, 6].map(
                (h, i) => (
                  <div
                    className="sg-spark-bar"
                    key={i}
                    style={{
                      height: `${h * 10}%`,
                      animationDelay: `${0.4 + i * 0.03}s`,
                    }}
                  />
                ),
              )}
            </div>
            <div className="sg-awaiting-data">
              Awaiting run history from writer
            </div>
          </div>
        </div>
      </div>

      <div className="sg-footer">
        <span className="sg-timestamp">
          LAST UPDATED{" "}
          {formatTime(status.updated_at ?? "")}
        </span>
      </div>
    </div>
  );
}
