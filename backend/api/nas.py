"""
API: NAS-Operationen
Mounten, Kopieren mit intelligenter Ordnerstruktur
"""
import asyncio
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import xxhash

from ..services.config import get_config
from ..services.exif_reader import get_shoot_date, get_camera_brand, get_full_exif

router = APIRouter()
nas_jobs: dict = {}

class NasCopyRequest(BaseModel):
    paths: List[str]  # Relative Pfade im Staging

@router.get("/status")
async def nas_status():
    """NAS-Verbindungsstatus prüfen"""
    config = get_config()
    mount_point = Path(config["nas"]["mount_point"])
    
    is_mounted = mount_point.exists() and os.path.ismount(str(mount_point))
    
    free_space = None
    if is_mounted:
        try:
            stat = os.statvfs(str(mount_point))
            free_space = stat.f_bavail * stat.f_frsize
        except:
            pass
    
    return {
        "mounted": is_mounted,
        "mount_point": str(mount_point),
        "nas_ip": config["nas"]["ip"],
        "free_space": free_space,
        "free_space_human": _bytes_human(free_space) if free_space else None
    }

@router.post("/mount")
async def mount_nas():
    """NAS über NFS mounten"""
    config = get_config()
    mount_point = config["nas"]["mount_point"]
    nas_ip = config["nas"]["ip"]
    export_path = config["nas"]["export_path"]
    
    Path(mount_point).mkdir(parents=True, exist_ok=True)
    
    if os.path.ismount(mount_point):
        return {"success": True, "message": "NAS bereits gemountet"}
    
    result = subprocess.run([
        "mount", "-t", "nfs",
        "-o", "nofail,timeo=14,retrans=3",
        f"{nas_ip}:{export_path}",
        mount_point
    ], capture_output=True, text=True, timeout=30)
    
    if result.returncode == 0:
        return {"success": True, "message": f"NAS gemountet: {mount_point}"}
    else:
        raise HTTPException(
            status_code=500,
            detail=f"NFS-Mount fehlgeschlagen: {result.stderr}. Prüfe NAS-IP und Export-Pfad."
        )

@router.post("/unmount")
async def unmount_nas():
    """NAS sicher unmounten"""
    config = get_config()
    mount_point = config["nas"]["mount_point"]
    
    result = subprocess.run(["umount", mount_point], capture_output=True, text=True)
    if result.returncode == 0:
        return {"success": True, "message": "NAS getrennt"}
    else:
        raise HTTPException(status_code=500, detail=f"Unmount fehlgeschlagen: {result.stderr}")

@router.post("/copy")
async def start_nas_copy(req: NasCopyRequest):
    """Bilder auf NAS kopieren mit intelligenter Ordnerstruktur"""
    job_id = f"nas_{len(nas_jobs)}"
    nas_jobs[job_id] = {"status": "running", "progress": 0, "total": len(req.paths)}
    
    asyncio.create_task(_copy_to_nas(job_id, req.paths))
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_nas_job(job_id: str):
    if job_id not in nas_jobs:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return nas_jobs[job_id]

async def _copy_to_nas(job_id: str, paths: List[str]):
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    nas_bilder = Path(config["nas"]["mount_point"]) / "Bilder"
    
    total = len(paths)
    copied = 0
    errors = []
    
    for rel_path in paths:
        src = staging / rel_path
        if not src.exists():
            errors.append(f"Nicht gefunden: {rel_path}")
            continue
        
        try:
            # XMP-Tags auslesen für Ordnerstruktur
            exif = get_full_exif(src)
            tags = _get_tags_from_exif(exif)
            shoot_date = get_shoot_date(src)
            
            # Ordnerstruktur bestimmen
            category_folder = _determine_category(tags)
            dest_dir = nas_bilder / category_folder / shoot_date
            dest_dir.mkdir(parents=True, exist_ok=True)
            
            dest_file = dest_dir / src.name
            
            # Duplikat-Check
            if dest_file.exists():
                if _checksum(src) == _checksum(dest_file):
                    copied += 1
                    continue
                dest_file = dest_dir / f"{src.stem}_2{src.suffix}"
            
            shutil.copy2(str(src), str(dest_file))
            
            # Checksumme verifizieren
            if _checksum(src) != _checksum(dest_file):
                errors.append(f"Checksum-Fehler: {src.name}")
                dest_file.unlink(missing_ok=True)
                continue
            
            # XMP-Sidecar auch kopieren
            xmp_src = src.with_suffix(".xmp")
            if xmp_src.exists():
                shutil.copy2(str(xmp_src), str(dest_dir / xmp_src.name))
            
            copied += 1
            nas_jobs[job_id].update({
                "status": "running",
                "progress": int((copied / total) * 100),
                "current_file": src.name,
                "copied": copied,
                "total": total,
                "dest_folder": str(category_folder / shoot_date)
            })
            
        except Exception as e:
            errors.append(f"{rel_path}: {str(e)}")
    
    nas_jobs[job_id].update({
        "status": "done",
        "progress": 100,
        "copied": copied,
        "errors": errors
    })

def _get_tags_from_exif(exif: dict) -> list:
    """XMP-Tags aus EXIF-Daten holen"""
    tags = []
    for field in ["XMP:Subject", "XMP:Keywords", "IPTC:Keywords"]:
        val = exif.get(field, "")
        if isinstance(val, list):
            tags.extend(val)
        elif val:
            tags.extend([t.strip() for t in str(val).split(",")])
    return [t for t in tags if t]

def _determine_category(tags: list) -> Path:
    """
    Ordnerstruktur aus Tags bestimmen
    Beispiele:
      ["Fuchs", "Wald"] → Tiere/Fuchs
      ["Landschaft", "Berge"] → Landschaft/Berge
    """
    tags_lower = [t.lower().strip() for t in tags]
    
    # Tier-Kategorien
    tier_map = {
        "fuchs": "Tiere/Fuchs",
        "hund": "Tiere/Hund",
        "katze": "Tiere/Katze",
        "vogel": "Tiere/Vogel",
        "taube": "Tiere/Vogel/Taube",
        "adler": "Tiere/Vogel/Adler",
        "pferd": "Tiere/Pferd",
        "reh": "Tiere/Reh",
        "hirsch": "Tiere/Hirsch",
        "wildschwein": "Tiere/Wildschwein",
        "tier": "Tiere",
        "animal": "Tiere",
    }
    
    # Landschaft-Kategorien
    land_map = {
        "sächsische schweiz": "Landschaft/Saechsische-Schweiz",
        "berge": "Landschaft/Berge",
        "wald": "Landschaft/Wald",
        "see": "Landschaft/Gewässer",
        "fluss": "Landschaft/Gewässer",
        "strand": "Landschaft/Strand",
        "landschaft": "Landschaft",
        "natur": "Landschaft/Natur",
    }
    
    other_map = {
        "architektur": "Architektur",
        "gebäude": "Architektur",
        "stadt": "Architektur/Stadt",
        "portrait": "Menschen/Portrait",
        "person": "Menschen",
        "makro": "Makro",
        "blume": "Pflanzen/Blumen",
        "pflanze": "Pflanzen",
    }
    
    for t in tags_lower:
        for key, folder in tier_map.items():
            if key in t:
                return Path(folder)
    
    for t in tags_lower:
        for key, folder in land_map.items():
            if key in t:
                return Path(folder)
    
    for t in tags_lower:
        for key, folder in other_map.items():
            if key in t:
                return Path(folder)
    
    return Path("Sonstiges")

def _checksum(path: Path) -> str:
    h = xxhash.xxh64()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def _bytes_human(b: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"
