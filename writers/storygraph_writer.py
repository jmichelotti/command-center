"""Reads storygraph-automation's status.json and writes common analytics format."""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

INPUT_PATH = Path(os.environ.get(
    "STORYGRAPH_STATUS_PATH",
    os.path.expanduser("~/dev/storygraph-automation/status/status.json"),
))
OUTPUT_DIR = Path(os.environ.get(
    "STATUS_DIR",
    str(Path(__file__).parent.parent / "data" / "status"),
))
OUTPUT_PATH = OUTPUT_DIR / "storygraph.json"
INTERVAL = int(os.environ.get("WRITER_INTERVAL", "30"))


def transform(raw: dict) -> dict:
    now = datetime.now(timezone.utc)
    state = "idle"
    label = "NOMINAL"
    fields = []

    any_failed = False
    any_running = False
    latest_run = None

    for name, profile in raw.items():
        status = profile.get("status", "unknown")
        duration = profile.get("duration_seconds")
        last_run = profile.get("last_run", "N/A")
        cron = profile.get("cron_schedule", "")
        next_run = profile.get("next_run", "")

        if status == "running":
            any_running = True
        elif status not in ("success",):
            any_failed = True

        if last_run and last_run != "N/A":
            try:
                ts = datetime.fromisoformat(last_run)
                if latest_run is None or ts > latest_run:
                    latest_run = ts
            except ValueError:
                pass

        duration_str = f" ({duration:.1f}s)" if duration else ""
        fields.append({
            "key": f"{name.capitalize()}",
            "value": f"{status.upper()}{duration_str}",
        })
        fields.append({"key": "  Last Run", "value": last_run})

        synced_this = profile.get("books_synced_this_run", profile.get("books_updated", 0))
        if synced_this and synced_this > 0:
            fields.append({"key": "  Synced", "value": f"{synced_this} books"})

        synced_total = profile.get("books_synced_total")
        if synced_total is not None:
            fields.append({"key": "  Total Synced", "value": f"{synced_total} books"})

        in_progress = profile.get("books_in_progress", [])
        if in_progress:
            fields.append({"key": "  In Progress", "value": f"{len(in_progress)} books"})
            latest_book = max(in_progress, key=lambda b: b.get("percent_complete", 0))
            pct = latest_book.get("percent_complete", 0)
            fields.append({
                "key": "  Latest",
                "value": f"{latest_book['title']} ({pct:.0f}%)",
            })

        if next_run:
            time_part = next_run.split("T")[1] if "T" in next_run else next_run
            fields.append({"key": "  Next Run", "value": time_part})

    if any_running:
        state = "active"
        label = "SYNCING"
    elif any_failed:
        state = "error"
        label = "FAULT"

    return {
        "project": "storygraph-automation",
        "updated_at": now.isoformat(),
        "state": state,
        "label": label,
        "fields": fields,
    }


def run_once():
    if not INPUT_PATH.exists():
        result = {
            "project": "storygraph-automation",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "state": "error",
            "label": "NO DATA",
            "fields": [{"key": "Error", "value": f"File not found: {INPUT_PATH}"}],
        }
    else:
        try:
            raw = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
            result = transform(raw)
        except (json.JSONDecodeError, OSError) as e:
            result = {
                "project": "storygraph-automation",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "state": "error",
                "label": "READ ERROR",
                "fields": [{"key": "Error", "value": str(e)}],
            }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")


def main():
    print(f"StoryGraph writer: {INPUT_PATH} -> {OUTPUT_PATH} (every {INTERVAL}s)")
    while True:
        try:
            run_once()
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
