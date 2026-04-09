"""
API: Dateien kopieren mit Fortschrittsanzeige und Restzeitberechnung
"""
import asyncio
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import List

import xxhash
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..services.config import get_config
from ..services.exif_reader import get_shoot_date, get_camera_brand

router = APIRouter()
active_jobs: dict = {}


class CopyRequest(BaseModel):
    source_paths: List[str]
    copy_type: str  # "photos" or "videos"


def _format_eta(seconds: float) -> str:
    """Sekunden in lesbare Restzeit umwandeln"""
    if seconds <= 0:
        return "fertig"
    if seconds < 60:
        return f"~{int(seconds)}s"
    if seconds < 3600:
        return f"~{int(seconds / 60)}min"
    return f"~{seconds / 3600:.1f}h"


def _format_speed(bytes_per_sec: float) -> str:
    """Bytes/s in lesbare Geschwindigkeit"""
    if bytes_per_sec > 1024 * 1024:
        return f"{bytes_per_sec / (1024 * 1024):.1f} MB/s"
    if bytes_per_sec > 1024:
        return f"{bytes_per_sec / 1024:.0f} KB/s"
    return f"{bytes_per_sec:.0f} B/s"


def _bytes_human(b: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} GB"


@router.post("/copy")
async def start_copy(req: CopyRequest):
    """Kopiervorgang starten"""
    job_id = f"copy_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    active_jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "total": len(req.source_paths),
        "copied": 0,
        "current_file": "",
        "eta": "",
        "speed": "",
        "errors": []
    }
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
                if active_jobs[job_id]["status"] in ("done", "done_with_errors", "error"):
                    break
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


async def _copy_files(job_id: str, source_paths: List[str], copy_type: str):
    config = get_config()

    if copy_type == "photos":
        dest_root = Path(config["app"]["local_staging"])
    else:
        dest_root = Path(config["nas"]["mount_point"]) / "Videos"

    total = len(source_paths)
    copied = 0
    errors = []
    start_time = time.time()
    bytes_copied = 0

    # Gesamtgröße berechnen
    total_bytes = 0
    for p in source_paths:
        try:
            total_bytes += Path(p).stat().st_size
        except:
            pass

    for i, src_path in enumerate(source_paths):
        src = Path(src_path)
        if not src.exists():
            errors.append(f"Nicht gefunden: {src_path}")
            continue

        try:
            file_size = src.stat().st_size

            # Datum und Hersteller aus EXIF
            shoot_date = get_shoot_date(src)
            brand = get_camera_brand(src, config["camera_brands"])
            folder_name = f"{shoot_date}_{brand}"
            dest_dir = dest_root / folder_name
            dest_dir.mkdir(parents=True, exist_ok=True)

            dest_file = dest_dir / src.name

            # Duplikat-Check
            if dest_file.exists():
                if _checksum(src) == _checksum(dest_file):
                    copied += 1
                    bytes_copied += file_size
                    _update_job(job_id, copied, total, src.name, folder_name,
                                bytes_copied, total_bytes, start_time, errors)
                    continue
                dest_file = dest_dir / f"{src.stem}_dup{src.suffix}"

            # Datei kopieren
            file_start = time.time()
            shutil.copy2(str(src), str(dest_file))

            # Checksumme verifizieren
            if _checksum(src) != _checksum(dest_file):
                errors.append(f"Checksum-Fehler: {src.name}")
                dest_file.unlink(missing_ok=True)
                continue

            copied += 1
            bytes_copied += file_size
            _update_job(job_id, copied, total, src.name, folder_name,
                        bytes_copied, total_bytes, start_time, errors)

        except Exception as e:
            errors.append(f"{src.name}: {str(e)}")

    active_jobs[job_id].update({
        "status": "done" if not errors else "done_with_errors",
        "progress": 100,
        "copied": copied,
        "total": total,
        "errors": errors,
        "eta": "Fertig",
        "speed": "",
        "dest_root": str(dest_root)
    })


def _update_job(job_id, copied, total, current_file, dest_folder,
                bytes_copied, total_bytes, start_time, errors):
    """Job-Status mit ETA aktualisieren"""
    elapsed = time.time() - start_time
    progress = int((copied / total) * 100) if total > 0 else 0

    # Geschwindigkeit und ETA berechnen
    speed_str = ""
    eta_str = ""

    if elapsed > 1 and bytes_copied > 0:
        speed = bytes_copied / elapsed
        speed_str = _format_speed(speed)

        if total_bytes > 0 and speed > 0:
            remaining_bytes = total_bytes - bytes_copied
            remaining_secs = remaining_bytes / speed
            eta_str = _format_eta(remaining_secs)

    active_jobs[job_id].update({
        "status": "running",
        "progress": progress,
        "current_file": current_file,
        "copied": copied,
        "total": total,
        "dest_folder": dest_folder,
        "speed": speed_str,
        "eta": eta_str,
        "bytes_copied": _bytes_human(bytes_copied),
        "bytes_total": _bytes_human(total_bytes),
        "errors": errors
    })


def _checksum(path: Path) -> str:
    h = xxhash.xxh64()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
