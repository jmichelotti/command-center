import asyncio
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config_loader import load_config
from backend.adapters import storygraph, jellyfin

PORT = 8100

ADAPTERS = {
    "storygraph": storygraph.fetch_status,
    "jellyfin": jellyfin.fetch_status,
}

app = FastAPI(title="Command Center")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://localhost:5181"],
    allow_methods=["*"],
    allow_headers=["*"],
)

assets_dir = Path(__file__).parent.parent / "assets"
app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/config")
def get_config():
    return load_config()


@app.get("/api/status")
async def get_status():
    config = load_config()
    data_sources = config.get("dataSources", {})

    zone_ids = []
    tasks = []

    for space in config.get("spaces", []):
        for zone in space.get("zones", []):
            ds_key = zone.get("dataSource")
            ds = data_sources.get(ds_key)
            if not ds:
                continue

            adapter_fn = ADAPTERS.get(ds["type"])
            if not adapter_fn:
                continue

            zone_ids.append(zone["id"])
            tasks.append(adapter_fn(ds["endpoint"]))

    statuses = await asyncio.gather(*tasks, return_exceptions=True)

    results = {}
    for zone_id, status in zip(zone_ids, statuses):
        if isinstance(status, Exception):
            results[zone_id] = {
                "state": "error",
                "label": "FAULT",
                "fields": [{"key": "Error", "value": str(status)}],
            }
        else:
            results[zone_id] = status

    return results


def _kill_port(port: int):
    """Kill any process listening on the given port (Windows-only)."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"(Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue).OwningProcess"],
            capture_output=True, text=True, timeout=5,
        )
        pids = {int(p) for p in result.stdout.split() if p.strip().isdigit()} - {0}
        for pid in pids:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                           capture_output=True, timeout=5)
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn

    _kill_port(PORT)
    uvicorn.run("backend.app:app", host="127.0.0.1", port=PORT, reload=True)
