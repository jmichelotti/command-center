import json
import os
import time
from pathlib import Path

STATUS_DIR = Path(os.environ.get(
    "STATUS_DIR",
    str(Path(__file__).parent.parent.parent / "data" / "status"),
))

STALE_THRESHOLD_S = int(os.environ.get("STALE_THRESHOLD_S", "300"))


async def fetch_status(filename: str) -> dict:
    path = STATUS_DIR / filename
    if not path.exists():
        return {
            "state": "error",
            "label": "NO DATA",
            "fields": [
                {"key": "Error", "value": f"Status file not found: {filename}"},
                {"key": "Expected", "value": str(path)},
            ],
        }

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        return {
            "state": "error",
            "label": "READ ERROR",
            "fields": [{"key": "Error", "value": str(e)}],
        }

    state = data.get("state", "error")
    label = data.get("label", "UNKNOWN")
    fields = data.get("fields", [])

    updated_at = data.get("updated_at", "")
    if updated_at:
        try:
            from datetime import datetime, timezone
            ts = datetime.fromisoformat(updated_at)
            age_s = (datetime.now(timezone.utc) - ts).total_seconds()
            if age_s > STALE_THRESHOLD_S and state != "error":
                label = f"STALE ({int(age_s // 60)}m ago)"
        except (ValueError, TypeError):
            pass

    result = {"state": state, "label": label, "fields": fields}
    if updated_at:
        result["updated_at"] = updated_at
    details = data.get("details")
    if details is not None:
        result["details"] = details
    return result
