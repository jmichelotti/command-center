import httpx


async def fetch_status(endpoint: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(endpoint)
            resp.raise_for_status()
            data = resp.json()

        profiles = data.get("profiles", {})
        schedules = data.get("schedules", {})

        state = "idle"
        label = "NOMINAL"

        for profile in profiles.values():
            status = profile.get("status", "")
            if status == "in_progress_or_failed":
                if not profile.get("last_run_completed", True):
                    state = "active"
                    label = "SYNCING"
                else:
                    state = "error"
                    label = "FAULT"
                break

        fields = []

        for name, profile in profiles.items():
            source = profile.get("source", "unknown").capitalize()
            p_status = profile.get("status", "unknown").replace("_", " ").upper()
            duration = profile.get("last_run_duration_s")
            last_run = profile.get("last_run_start", "N/A")
            applied = profile.get("last_run_applied_count", 0)

            duration_str = f" ({duration:.1f}s)" if duration else ""
            fields.append({"key": f"{name.capitalize()} ({source})", "value": f"{p_status}{duration_str}"})
            fields.append({"key": f"  Last Run", "value": last_run})

            if applied and applied > 0:
                titles = profile.get("last_run_applied_titles", [])
                fields.append({"key": f"  Synced", "value": f"{applied} books"})
                for title in titles[:3]:
                    fields.append({"key": f"    ", "value": title})

            if "total_books_applied" in profile:
                fields.append({"key": f"  Total Synced", "value": f"{profile['total_books_applied']} books"})

            if "in_progress_books" in profile:
                books = profile["in_progress_books"]
                fields.append({"key": f"  In Progress", "value": f"{len(books)} books"})
                if books:
                    latest = max(books, key=lambda b: b.get("updated_at", ""))
                    pct = latest.get("percent_complete", 0)
                    fields.append({"key": f"  Latest", "value": f"{latest['title']} ({pct:.0f}%)"})

            sched = schedules.get(name, {})
            next_run = sched.get("next_run", "")
            if next_run:
                time_part = next_run.split("T")[1] if "T" in next_run else next_run
                fields.append({"key": f"  Next Run", "value": time_part})

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
