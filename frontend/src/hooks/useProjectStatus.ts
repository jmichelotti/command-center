import { useState, useEffect, useRef } from "react";
import type { Config, BotState } from "../types/config";

export interface ProjectStatus {
  state: BotState;
  label: string;
  fields: { key: string; value: string }[];
  updated_at?: string;
  details?: Record<string, unknown>;
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

    let timeoutId: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await fetchStatus();
      if (mountedRef.current) {
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [config]);

  return statuses;
}
