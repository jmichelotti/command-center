"""Polls Jellyfin server API and writes common analytics format."""

import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError
from urllib.parse import quote

JELLYFIN_HOST = os.environ.get("JELLYFIN_HOST", "192.168.4.74")
JELLYFIN_PORT = os.environ.get("JELLYFIN_PORT", "8096")
JELLYFIN_API_KEY = os.environ.get("JELLYFIN_API_KEY", "")
BASE_URL = f"http://{JELLYFIN_HOST}:{JELLYFIN_PORT}"

OUTPUT_DIR = Path(os.environ.get(
    "STATUS_DIR",
    str(Path(__file__).parent.parent / "data" / "status"),
))
OUTPUT_PATH = OUTPUT_DIR / "jellyfin.json"
INTERVAL = int(os.environ.get("WRITER_INTERVAL", "30"))
GAPS_INTERVAL = int(os.environ.get("GAPS_INTERVAL", "21600"))  # 6 hours
GAPS_LOOKBACK_DAYS = int(os.environ.get("GAPS_LOOKBACK_DAYS", "90"))

CACHE_PATH = Path(os.environ.get(
    "GAPS_CACHE_PATH",
    str(Path(__file__).parent.parent / "data" / "tracked_shows.json"),
))

# TVmaze season + offset = Jellyfin season (for metadata numbering mismatches)
_SEASON_OFFSETS: dict[str, int] = {
    "Australian Survivor": -2,
}

_IGNORE_SHOWS: set[str] = {
    "SpongeBob SquarePants",
}

_gaps_cache: dict | None = None
_gaps_last_fetch: float = 0


# ── Jellyfin API ─────────────────────────────────────────────────────

def _api(path: str, timeout: float = 10.0) -> dict:
    url = f"{BASE_URL}{path}"
    sep = "&" if "?" in path else "?"
    url = f"{url}{sep}api_key={JELLYFIN_API_KEY}"
    req = Request(url)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _jf_post(path: str, body: dict, timeout: float = 10.0) -> dict:
    url = f"{BASE_URL}{path}?api_key={JELLYFIN_API_KEY}"
    data = json.dumps(body).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _fetch_server_info() -> dict:
    return _api("/System/Info")


def _fetch_sessions() -> list:
    return _api("/Sessions")


def _get_admin_user_id() -> str | None:
    try:
        users = _api("/Users")
        for u in users:
            if u.get("Policy", {}).get("IsAdministrator"):
                return u["Id"]
    except Exception:
        pass
    return None


_admin_uid: str | None = None


def _fetch_library_counts() -> dict:
    global _admin_uid
    if _admin_uid is None:
        _admin_uid = _get_admin_user_id() or ""
    counts = {}
    user_param = f"&UserId={_admin_uid}" if _admin_uid else ""
    for item_type in ("Movie", "Series", "Episode"):
        try:
            data = _api(f"/Items?IncludeItemTypes={item_type}&Recursive=true&Limit=0{user_param}")
            counts[item_type.lower()] = data.get("TotalRecordCount", 0)
        except Exception:
            counts[item_type.lower()] = "?"
    return counts


# ── TVmaze API (no auth required) ────────────────────────────────────

_TVMAZE_BASE = "https://api.tvmaze.com"


def _tvmaze_get(path: str, params: dict | None = None, timeout: float = 15.0):
    url = f"{_TVMAZE_BASE}{path}"
    if params:
        qs = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
        url = f"{url}?{qs}"
    req = Request(url)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _tvmaze_lookup_by_tvdb(tvdb_id: str):
    try:
        return _tvmaze_get("/lookup/shows", {"thetvdb": tvdb_id})
    except URLError:
        return None


def _tvmaze_lookup_by_imdb(imdb_id: str):
    try:
        return _tvmaze_get("/lookup/shows", {"imdb": imdb_id})
    except URLError:
        return None


def _tvmaze_search(name: str):
    try:
        return _tvmaze_get("/search/shows", {"q": name})
    except URLError:
        return []


def _tvmaze_episodes(show_id: int) -> list[dict]:
    try:
        return _tvmaze_get(f"/shows/{show_id}/episodes")
    except URLError:
        return []


# ── TVmaze ID resolution ─────────────────────────────────────────────

def _load_show_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_show_cache(data: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _resolve_tvmaze_id(series: dict, cache: dict) -> int | None:
    jf_id = series["Id"]

    if jf_id in cache and cache[jf_id].get("tvmaze_id"):
        return cache[jf_id]["tvmaze_id"]

    providers = series.get("ProviderIds", {})

    tvdb = providers.get("Tvdb")
    if tvdb:
        result = _tvmaze_lookup_by_tvdb(tvdb)
        if result:
            return result["id"]

    imdb = providers.get("Imdb")
    if imdb:
        result = _tvmaze_lookup_by_imdb(imdb)
        if result:
            return result["id"]

    results = _tvmaze_search(series.get("Name", ""))
    if results:
        return results[0]["show"]["id"]

    return None


# ── Episode gap detection ─────────────────────────────────────────────

def _get_watched_show_names(days: int = 90) -> set[str]:
    sql = (
        "SELECT DISTINCT "
        "CASE "
        "WHEN ItemName LIKE '%% - %%' THEN SUBSTR(ItemName, 1, INSTR(ItemName, ' - ') - 1) "
        "ELSE ItemName "
        "END as show_name "
        "FROM PlaybackActivity "
        "WHERE ItemType = 'Episode' "
        f"AND DateCreated >= datetime('now', '-{days} days')"
    )
    try:
        data = _jf_post(
            "/user_usage_stats/submit_custom_query",
            {"CustomQueryString": sql, "ReplaceUserId": False},
            timeout=15.0,
        )
        return {row[0] for row in data.get("results", []) if row[0]}
    except Exception as e:
        print(f"Playback query failed: {e}", file=sys.stderr)
        return set()


def _fetch_episode_gaps() -> dict:
    """Find missing aired episodes for currently-airing shows users are watching."""
    today = date.today()
    cache = _load_show_cache()

    watched_names = _get_watched_show_names(GAPS_LOOKBACK_DAYS)
    if not watched_names:
        return {"total_missing_episodes": 0, "gaps": []}

    all_series = _api(
        "/Items?IncludeItemTypes=Series&Recursive=true"
        "&Fields=ProviderIds,Status,RecursiveItemCount&Limit=500",
        timeout=30.0,
    ).get("Items", [])

    candidates: dict[str, list[dict]] = {}
    for s in all_series:
        name = s.get("Name", "")
        status = s.get("Status", "")
        if name in watched_names and status == "Continuing":
            candidates.setdefault(name, []).append(s)

    print(f"Gap scan: {len(candidates)} continuing series out of {len(watched_names)} watched", file=sys.stderr)

    gaps = []
    total_missing = 0

    for name, entries in candidates.items():
        if name in _IGNORE_SHOWS:
            continue

        series = entries[0]
        try:
            tvmaze_id = _resolve_tvmaze_id(series, cache)
        except Exception as e:
            print(f"TVmaze lookup failed for {name}: {e}", file=sys.stderr)
            continue

        if tvmaze_id is None:
            print(f"Could not find {name} on TVmaze", file=sys.stderr)
            continue

        # Merge episodes across all Jellyfin entries for this show
        jf_set: set[tuple[int, int]] = set()
        jf_seasons: set[int] = set()
        best_jf_id = entries[0]["Id"]
        best_count = 0

        for entry in entries:
            try:
                eps_data = _api(
                    f"/Shows/{entry['Id']}/Episodes?Fields=PremiereDate,ProviderIds&Limit=1000",
                    timeout=15.0,
                )
            except Exception:
                continue
            eps = eps_data.get("Items", [])
            if len(eps) > best_count:
                best_count = len(eps)
                best_jf_id = entry["Id"]
            for ep in eps:
                s_num = ep.get("ParentIndexNumber")
                e_num = ep.get("IndexNumber")
                if s_num is not None and e_num is not None:
                    jf_set.add((s_num, e_num))
                    jf_seasons.add(s_num)

        cache[best_jf_id] = {
            "name": name,
            "tvmaze_id": tvmaze_id,
            "tvdb_id": series.get("ProviderIds", {}).get("Tvdb"),
            "last_checked": today.isoformat(),
        }

        tvmaze_eps = _tvmaze_episodes(tvmaze_id)
        time.sleep(0.3)

        if jf_seasons:
            latest = max(jf_seasons)
            check_seasons = {latest, latest + 1}
        else:
            continue

        offset = _SEASON_OFFSETS.get(name, 0)

        missing = []
        for ep in tvmaze_eps:
            s_num = ep.get("season")
            e_num = ep.get("number")
            airdate = ep.get("airdate")

            if not s_num or not e_num or not airdate:
                continue
            if s_num == 0:
                continue

            jf_s = s_num + offset
            if jf_s not in check_seasons:
                continue

            try:
                aired = date.fromisoformat(airdate)
            except ValueError:
                continue
            if aired > today:
                continue

            if (jf_s, e_num) not in jf_set:
                missing.append({
                    "code": f"S{jf_s:02d}E{e_num:02d}",
                    "title": ep.get("name", ""),
                    "airdate": airdate,
                })

        if missing:
            missing.sort(key=lambda x: x["code"])
            gaps.append({
                "show": name,
                "missing_episodes": missing,
            })
            total_missing += len(missing)

    _save_show_cache(cache)
    gaps.sort(key=lambda x: x["show"])
    return {"total_missing_episodes": total_missing, "gaps": gaps}


def _get_gaps() -> dict | None:
    global _gaps_cache, _gaps_last_fetch
    now = time.time()
    if now - _gaps_last_fetch >= GAPS_INTERVAL:
        try:
            _gaps_cache = _fetch_episode_gaps()
            _gaps_last_fetch = now
        except Exception as e:
            print(f"Gap detection error: {e}", file=sys.stderr)
    return _gaps_cache


# ── Status builder ────────────────────────────────────────────────────

def build_status() -> dict:
    now = datetime.now(timezone.utc)

    try:
        server = _fetch_server_info()
    except (URLError, OSError, json.JSONDecodeError) as e:
        return {
            "project": "jellyfin",
            "updated_at": now.isoformat(),
            "state": "error",
            "label": "OFFLINE",
            "fields": [
                {"key": "Error", "value": str(e)},
                {"key": "Host", "value": f"{JELLYFIN_HOST}:{JELLYFIN_PORT}"},
            ],
        }

    server_name = server.get("ServerName", "unknown")
    version = server.get("Version", "?")

    try:
        sessions = _fetch_sessions()
    except Exception:
        sessions = []

    active_streams = [
        s for s in sessions
        if s.get("NowPlayingItem") and not s.get("Client", "").startswith("Jellyfin")
    ]
    stream_count = len(active_streams)

    try:
        lib = _fetch_library_counts()
    except Exception:
        lib = {}

    gaps_data = _get_gaps()
    total_missing = 0
    gaps = []
    if gaps_data:
        total_missing = gaps_data.get("total_missing_episodes", 0)
        gaps = gaps_data.get("gaps", [])

    if stream_count > 0:
        state = "active"
        label = f"STREAMING ({stream_count})"
    elif total_missing > 0:
        state = "active"
        label = f"NEW EPISODES ({total_missing})"
    else:
        state = "idle"
        label = "NOMINAL"

    fields = [
        {"key": "Server", "value": server_name},
        {"key": "Version", "value": version},
        {"key": "Active Streams", "value": str(stream_count)},
    ]

    for i, stream in enumerate(active_streams[:4], 1):
        user = stream.get("UserName", "?")
        item = stream.get("NowPlayingItem", {})
        title = item.get("Name", "?")
        series = item.get("SeriesName")
        if series:
            season = item.get("ParentIndexNumber", "?")
            ep = item.get("IndexNumber", "?")
            title = f"{series} S{season:02d}E{ep:02d}" if isinstance(season, int) and isinstance(ep, int) else f"{series} - {title}"
        play_method = stream.get("PlayState", {}).get("PlayMethod", "")
        method_str = f" ({play_method})" if play_method else ""
        fields.append({"key": f"  Stream {i}", "value": f"{user} — {title}{method_str}"})

    if gaps:
        fields.append({"key": "New Episodes", "value": str(total_missing)})
        for gap in gaps[:5]:
            show = gap.get("show", "?")
            missing = gap.get("missing_episodes", [])
            codes = ", ".join(ep.get("code", "?") for ep in missing[:5])
            if len(missing) > 5:
                codes += f" +{len(missing) - 5} more"
            fields.append({"key": f"  {show}", "value": codes})

    movies = lib.get("movie", "?")
    series_count = lib.get("series", "?")
    episodes = lib.get("episode", "?")
    fields.extend([
        {"key": "Movies", "value": f"{movies:,}" if isinstance(movies, int) else str(movies)},
        {"key": "Series", "value": f"{series_count:,}" if isinstance(series_count, int) else str(series_count)},
        {"key": "Episodes", "value": f"{episodes:,}" if isinstance(episodes, int) else str(episodes)},
    ])

    return {
        "project": "jellyfin",
        "updated_at": now.isoformat(),
        "state": state,
        "label": label,
        "fields": fields,
    }


def run_once():
    result = build_status()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")


def main():
    if not JELLYFIN_API_KEY:
        print("Error: JELLYFIN_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    print(f"Jellyfin writer: {BASE_URL} -> {OUTPUT_PATH} (every {INTERVAL}s, gaps every {GAPS_INTERVAL}s)")
    while True:
        try:
            run_once()
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
