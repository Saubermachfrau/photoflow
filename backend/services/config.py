"""Konfiguration laden und cachen"""
import json
import os
from pathlib import Path
from functools import lru_cache

DEFAULT_CONFIG = {
    "nas": {
        "ip": "192.168.1.100",
        "export_path": "/volume2",
        "mount_point": "/mnt/photoflow-nas",
        "bilder_path": "/volume2/Bilder",
        "videos_path": "/volume2/Videos",
        "presets_path": "/volume2/Lightroom/Presets"
    },
    "app": {
        "port": 8080,
        "host": "0.0.0.0",
        "local_staging": "/var/lib/photoflow/staging",
        "trash_dir": "/var/lib/photoflow/trash",
        "thumbnails_dir": "/var/lib/photoflow/thumbnails"
    },
    "camera_brands": {
        "SONY": "SONY",
        "ILCE": "SONY",
        "ZV": "SONY",
        "DSC": "SONY",
        "DJI": "DJI-Drohne",
        "FC": "DJI-Drohne",
        "Action": "DJI-Action",
        "Osmo": "DJI-Action",
        "Canon": "Canon",
        "Nikon": "Nikon",
        "FUJIFILM": "Fujifilm",
        "GoPro": "GoPro"
    },
    "ai": {
        "model": "llava:7b",
        "ollama_url": "http://localhost:11434"
    }
}

def get_config() -> dict:
    config_path = os.environ.get("PHOTOFLOW_CONFIG", "/opt/photoflow/config.json")
    if Path(config_path).exists():
        with open(config_path) as f:
            return json.load(f)
    return DEFAULT_CONFIG
