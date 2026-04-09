"""
API: Dateien kopieren mit Fortschrittsanzeige
Bilder → Staging (SSD), Videos → NAS
"""
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

import aiofiles
import xxhash
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..services.config import get_config
from ..services.exif_reader import get_shoot_date, get_camera_brand

router = APIRouter()
active_jobs: dict = {}

class CopyRequest(BaseModel):
    source_paths: list[str]
    copy_type: str  # "photos" or "videos"

@router.post("/copy")
async def start_copy(req: CopyRequest):
    """Kopiervorgang starten"""
    job_id = f"copy_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    active_jobs[job_id] = {"status": "running", "progress": 0, "total": len(req.source_paths)}
    
    asyncio.create_task(_copy_files(job_id, req.source_paths, req.copy_type))
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return active_jobs[job_id]

@router.websocket("/ws/progress/{job_id}")
async def progress_websocket(websocket: WebSocket, job_id: str):
    await websocket.accept()
    try:
        while True:
            if job_id in active_jobs:
                await websocket.send_json(active_jobs[job_id])
                if active_jobs[job_id]["status"] in ("done", "error"):
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass

async def _copy_files(job_id: str, source_paths: list, copy_type: str):
    config = get_config()
    
    if copy_type == "photos":
        dest_root = Path(config["app"]["local_staging"])
    else:
        dest_root = Path(config["nas"]["mount_point"]) / "Videos"
    
    total = len(source_paths)
    copied = 0
    errors = []
    
    for src_path in source_paths:
        src = Path(src_path)
        if not src.exists():
            errors.append(f"Nicht gefunden: {src_path}")
            continue
        
        try:
            # EXIF-Datum und Kamerahersteller auslesen
            shoot_date = get_shoot_date(src)
            brand = get_camera_brand(src, config["camera_brands"])
            
            # Ordnerstruktur: YYYY-MM-DD_BRAND
            folder_name = f"{shoot_date}_{brand}"
            dest_dir = dest_root / folder_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            
            dest_file = dest_dir / src.name
            
            # Duplikat-Check
            if dest_file.exists():
                if _checksum(src) == _checksum(dest_file):
                    copied += 1
                    active_jobs[job_id].update({
                        "progress": int((copied / total) * 100),
                        "current_file": src.name,
                        "copied": copied,
                        "total": total
                    })
                    continue
                else:
                    # Datei mit Suffix umbenennen
                    dest_file = dest_dir / f"{src.stem}_dup{src.suffix}"
            
            # Datei kopieren
            shutil.copy2(str(src), str(dest_file))
            
            # Checksummen-Verifikation
            if _checksum(src) != _checksum(dest_file):
                errors.append(f"Checksum-Fehler: {src.name}")
                dest_file.unlink(missing_ok=True)
                continue
            
            copied += 1
            active_jobs[job_id].update({
                "status": "running",
                "progress": int((copied / total) * 100),
                "current_file": src.name,
                "copied": copied,
                "total": total,
                "dest_folder": folder_name
            })
            
        except Exception as e:
            errors.append(f"{src.name}: {str(e)}")
    
    active_jobs[job_id].update({
        "status": "done" if not errors else "done_with_errors",
        "progress": 100,
        "copied": copied,
        "total": total,
        "errors": errors,
        "dest_root": str(dest_root)
    })

def _checksum(path: Path) -> str:
    """xxHash für schnelle Checksummen-Berechnung"""
    h = xxhash.xxh64()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
