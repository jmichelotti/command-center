import asyncio
import re
import subprocess
import sys
from pathlib import Path

import yaml
from fastapi import FastAPI, File, Form, UploadFile
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


CONFIG_PATH = Path(__file__).parent.parent / "config" / "spaces.yaml"
ASSETS_DIR = Path(__file__).parent.parent / "assets"


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "space"


class _FlowListDumper(yaml.SafeDumper):
    pass

def _flow_list_representer(dumper, data):
    if all(isinstance(x, (int, float)) for x in data):
        return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=True)
    return dumper.represent_sequence("tag:yaml.org,2002:seq", data, flow_style=False)

_FlowListDumper.add_representer(list, _flow_list_representer)


def _save_config(config: dict):
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(config, f, Dumper=_FlowListDumper, default_flow_style=False,
                  sort_keys=False, allow_unicode=True)


@app.post("/api/spaces")
async def create_space(
    name: str = Form(...),
    native_width: int = Form(...),
    native_height: int = Form(...),
    background: UploadFile = File(...),
    bot_name: str = Form(""),
    bot_sprite: UploadFile | None = File(None),
):
    config = load_config()
    space_id = _slugify(name)

    existing_ids = {s["id"] for s in config.get("spaces", [])}
    while space_id in existing_ids:
        space_id += "-2"

    bg_ext = Path(background.filename or "bg.jpg").suffix.lower() or ".jpg"
    bg_filename = f"{space_id}{bg_ext}"
    bg_dir = ASSETS_DIR / "backgrounds"
    bg_dir.mkdir(parents=True, exist_ok=True)
    bg_path = bg_dir / bg_filename
    bg_data = await background.read()
    bg_path.write_bytes(bg_data)

    new_space = {
        "id": space_id,
        "name": name,
        "image": f"backgrounds/{bg_filename}",
        "nativeWidth": native_width,
        "nativeHeight": native_height,
        "zones": [],
    }

    bot_type_key = None
    if bot_name and bot_sprite and bot_sprite.filename:
        sprite_ext = Path(bot_sprite.filename).suffix.lower() or ".png"
        sprite_slug = _slugify(bot_name)
        sprite_filename = f"{sprite_slug}{sprite_ext}"
        sprite_dir = ASSETS_DIR / "sprites"
        sprite_dir.mkdir(parents=True, exist_ok=True)
        sprite_path = sprite_dir / sprite_filename
        sprite_data = await bot_sprite.read()
        sprite_path.write_bytes(sprite_data)

        bot_type_key = sprite_slug
        if "botTypes" not in config:
            config["botTypes"] = {}
        config["botTypes"][bot_type_key] = {
            "label": bot_name,
            "sprite": f"sprites/{sprite_filename}",
            "placeholder": {"shape": "circle", "size": 5},
            "colors": {
                "active": "#00ff88",
                "idle": "#4a6fa5",
                "error": "#ff4444",
            },
        }

    if "spaces" not in config:
        config["spaces"] = []
    config["spaces"].append(new_space)

    _save_config(config)

    return {
        "ok": True,
        "spaceId": space_id,
        "botTypeKey": bot_type_key,
        "config": load_config(),
    }


@app.post("/api/spaces/{space_id}/zones")
async def create_zone(
    space_id: str,
    zone_name: str = Form(...),
    polygon: str = Form(...),
    data_source: str = Form(""),
    bot_type_key: str = Form(""),
    bot_name: str = Form(""),
    bot_sprite: UploadFile | None = File(None),
):
    import json as _json

    config = load_config()

    space = None
    for s in config.get("spaces", []):
        if s["id"] == space_id:
            space = s
            break
    if not space:
        return {"ok": False, "message": f"Space '{space_id}' not found"}

    poly = _json.loads(polygon)

    zone_id = _slugify(zone_name)
    existing_ids = {z["id"] for z in space.get("zones", [])}
    while zone_id in existing_ids:
        zone_id += "-2"

    # Determine bot type: use existing or create new from uploaded sprite
    if bot_type_key:
        bot_key = bot_type_key
    elif bot_name and bot_sprite and bot_sprite.filename:
        sprite_ext = Path(bot_sprite.filename).suffix.lower() or ".png"
        sprite_slug = _slugify(bot_name)
        sprite_filename = f"{sprite_slug}{sprite_ext}"
        sprite_dir = ASSETS_DIR / "sprites"
        sprite_dir.mkdir(parents=True, exist_ok=True)
        sprite_path = sprite_dir / sprite_filename
        sprite_data = await bot_sprite.read()
        sprite_path.write_bytes(sprite_data)

        bot_key = sprite_slug
        if "botTypes" not in config:
            config["botTypes"] = {}
        config["botTypes"][bot_key] = {
            "label": bot_name,
            "sprite": f"sprites/{sprite_filename}",
            "placeholder": {"shape": "circle", "size": 5},
            "colors": {
                "active": "#00ff88",
                "idle": "#4a6fa5",
                "error": "#ff4444",
            },
        }
    else:
        return {"ok": False, "message": "Must provide bot_type_key or bot_name + bot_sprite"}

    zone = {
        "id": zone_id,
        "name": zone_name,
        "polygon": poly,
        "bot": bot_key,
    }
    if data_source:
        zone["dataSource"] = data_source

    if "zones" not in space:
        space["zones"] = []
    space["zones"].append(zone)

    _save_config(config)

    return {"ok": True, "zoneId": zone_id, "config": load_config()}


def _kill_port(port: int):
    """Kill any process listening on the given port (Windows-only)."""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"(Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue).OwningProcess"],
            capture_output=True, text=True, timeout=5,
        )
        pids = {int(p) for p in result.stdout.split() if p.strip().isdigit()} - {0}
        if pids:
            pid_list = ",".join(str(p) for p in pids)
            subprocess.run(
                ["powershell", "-Command",
                 f"Stop-Process -Id {pid_list} -Force -ErrorAction SilentlyContinue"],
                capture_output=True, timeout=5,
            )
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn

    _kill_port(PORT)
    uvicorn.run("backend.app:app", host="127.0.0.1", port=PORT, reload=True)
