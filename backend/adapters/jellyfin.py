import httpx


async def fetch_status(endpoint: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint)
            resp.raise_for_status()
            data = resp.json()

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

        if active_streams > 0:
            state = "active"
            label = f"STREAMING ({active_streams})"
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

    except httpx.ConnectError:
        return _error("Connection refused", endpoint)
    except httpx.TimeoutException:
        return _error("Request timeout", endpoint)
    except Exception as e:
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
