import threading
import time

import httpx

_gaps_cache: dict = {"data": None, "expires": time.time() + 30}
_gaps_thread: threading.Thread | None = None
_GAPS_TTL = 300

_status_cache: dict | None = None


def _fetch_gaps_sync(url: str):
    global _gaps_thread
    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            _gaps_cache["data"] = resp.json()
            _gaps_cache["expires"] = time.time() + _GAPS_TTL
    except Exception:
        pass
    finally:
        _gaps_thread = None


def _get_gaps(url: str) -> dict | None:
    global _gaps_thread
    now = time.time()
    if now >= _gaps_cache["expires"] and _gaps_thread is None:
        _gaps_thread = threading.Thread(target=_fetch_gaps_sync, args=(url,), daemon=True)
        _gaps_thread.start()
    return _gaps_cache["data"]


def _build_result(data: dict, gaps_data: dict | None) -> dict:
    server = data.get("server", {})
    sessions = data.get("sessions", {})
    library = data.get("library", {})

    if not server.get("online", False):
        return {
            "state": "error",
            "label": "DOWN",
            "fields": [
                {"key": "Server", "value": server.get("server_name", "unknown")},
                {"key": "Status", "value": "OFFLINE"},
            ],
        }

    active_streams = sessions.get("active_streams", 0)
    streams = sessions.get("streams", [])

    total_missing = 0
    gaps = []
    if gaps_data:
        total_missing = gaps_data.get("total_missing_episodes", 0)
        gaps = gaps_data.get("gaps", [])

    if active_streams > 0:
        state = "active"
        label = f"STREAMING ({active_streams})"
    elif total_missing > 0:
        state = "active"
        label = f"MISSING EPISODES ({total_missing})"
    else:
        state = "idle"
        label = "NOMINAL"

    fields = [
        {"key": "Server", "value": server.get("server_name", "unknown")},
        {"key": "Version", "value": server.get("version", "?")},
        {"key": "Active Streams", "value": str(active_streams)},
    ]

    for i, stream in enumerate(streams[:4], 1):
        user = stream.get("user", "?")
        title = stream.get("now_playing", stream.get("title", "?"))
        method = stream.get("playback_method", "")
        method_str = f" ({method})" if method else ""
        fields.append({"key": f"  Stream {i}", "value": f"{user} — {title}{method_str}"})

    if gaps:
        fields.append({"key": "Missing Episodes", "value": str(total_missing)})
        for gap in gaps[:5]:
            show = gap.get("show", "?")
            missing = gap.get("missing_episodes", [])
            codes = ", ".join(ep.get("code", "?") for ep in missing[:5])
            if len(missing) > 5:
                codes += f" +{len(missing) - 5} more"
            fields.append({"key": f"  {show}", "value": codes})

    fields.extend([
        {"key": "Movies", "value": f"{library.get('movies', '?'):,}" if isinstance(library.get('movies'), int) else str(library.get('movies', '?'))},
        {"key": "Series", "value": f"{library.get('series', '?'):,}" if isinstance(library.get('series'), int) else str(library.get('series', '?'))},
        {"key": "Episodes", "value": f"{library.get('episodes', '?'):,}" if isinstance(library.get('episodes'), int) else str(library.get('episodes', '?'))},
    ])

    storage = library.get("storage", [])
    if storage:
        total_used = sum(d.get("used_gb", 0) for d in storage if isinstance(d.get("used_gb"), (int, float)))
        total_size = sum(d.get("total_gb", 0) for d in storage if isinstance(d.get("total_gb"), (int, float)))
        if total_size > 0:
            fields.append({"key": "Storage", "value": f"{total_used:.1f} TB / {total_size:.1f} TB" if total_size > 1000 else f"{total_used:.0f} GB / {total_size:.0f} GB"})

    return {"state": state, "label": label, "fields": fields}


async def fetch_status(endpoint: str) -> dict:
    global _status_cache
    base_url = endpoint.rsplit("/", 1)[0]
    gaps_url = f"{base_url}/episodes/gaps"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(endpoint)
            resp.raise_for_status()
            data = resp.json()

        gaps_data = _get_gaps(gaps_url)
        result = _build_result(data, gaps_data)
        _status_cache = result
        return result

    except (httpx.ConnectError, httpx.TimeoutException):
        if _status_cache is not None:
            return _status_cache
        return _error("Connection timeout", endpoint)
    except Exception as e:
        if _status_cache is not None:
            return _status_cache
        return _error(str(e), endpoint)


def _error(message: str, endpoint: str) -> dict:
    return {
        "state": "error",
        "label": "OFFLINE",
        "fields": [
            {"key": "Error", "value": message},
            {"key": "Endpoint", "value": endpoint},
        ],
    }
