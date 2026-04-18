import { useState, useEffect, useRef } from "react";
import type { Config, BotState } from "../types/config";

export interface ProjectStatus {
  state: BotState;
  label: string;
  fields: { key: string; value: string }[];
}

const POLL_INTERVAL_MS = 15_000;

export function useProjectStatus(config: Config): Record<string, ProjectStatus> {
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mountedRef.current) setStatuses(data);
      } catch (err) {
        if (!mountedRef.current) return;
        const fallback: Record<string, ProjectStatus> = {};
        for (const space of config.spaces) {
          for (const zone of space.zones) {
            fallback[zone.id] = {
              state: "error",
              label: "OFFLINE",
              fields: [{ key: "Error", value: String(err) }],
            };
          }
        }
        setStatuses(fallback);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [config]);

  return statuses;
}
