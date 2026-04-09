"""
API: Speicherkarten verwalten
Erkennen, mounten, unmounten über udisks2
"""
import asyncio
import json
import re
import subprocess
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class CardInfo(BaseModel):
    device: str
    label: str
    size: int
    size_human: str
    mounted: bool
    mount_point: Optional[str]
    filesystem: str

class MountRequest(BaseModel):
    device: str

def run_cmd(cmd: list, check=True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=check)

def bytes_to_human(b: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"

def is_valid_device(device: str) -> bool:
    """Prüft ob das Gerät ein gültiges Block-Device ist (sda-sdz oder mmcblk)"""
    return bool(re.match(r'^/dev/(sd[a-z][0-9]?|mmcblk[0-9]+p?[0-9]*)$', device))

@router.get("/", response_model=List[CardInfo])
async def list_cards():
    """Alle angeschlossenen USB-Speichergeräte auflisten"""
    try:
        result = run_cmd([
            "lsblk", "-J", "-o", "NAME,SIZE,LABEL,FSTYPE,MOUNTPOINT,HOTPLUG,RM,TYPE,TRAN"
        ], check=False)

        if result.returncode != 0:
            return []

        data = json.loads(result.stdout)
        cards = []

        for device in data.get("blockdevices", []):
            # Nur USB-Geräte (hotplug oder removable)
            is_usb = device.get("tran") == "usb" or device.get("hotplug") or device.get("rm")
            if not is_usb:
                continue
            if device.get("type") != "disk":
                continue

            # Partitionen verarbeiten
            children = device.get("children", [])

            if not children:
                size_str = device.get("size", "0")
                cards.append(CardInfo(
                    device=f"/dev/{device['name']}",
                    label=device.get("label") or device["name"],
                    size=_parse_size(size_str),
                    size_human=size_str,
                    mounted=False,
                    mount_point=None,
                    filesystem=device.get("fstype") or "unknown"
                ))
            else:
                for part in children:
                    if part.get("type") != "part":
                        continue
                    mount = part.get("mountpoint")
                    size_str = part.get("size", "0")
                    cards.append(CardInfo(
                        device=f"/dev/{part['name']}",
                        label=part.get("label") or device.get("label") or part["name"],
                        size=_parse_size(size_str),
                        size_human=size_str,
                        mounted=bool(mount),
                        mount_point=mount,
                        filesystem=part.get("fstype") or "unknown"
                    ))

        return cards

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fehler beim Lesen der Geräte: {str(e)}")

@router.post("/mount")
async def mount_card(req: MountRequest):
    """Karte mounten"""
    device = req.device

    if not is_valid_device(device):
        raise HTTPException(status_code=400, detail=f"Ungültiges Gerät: {device}")

    # Prüfen ob bereits gemountet
    result = run_cmd(["lsblk", "-o", "MOUNTPOINT", "-n", device], check=False)
    existing_mount = result.stdout.strip()
    if existing_mount:
        return {
            "success": True,
            "mount_point": existing_mount,
            "message": f"Bereits gemountet: {existing_mount}"
        }

    # Mount mit udisksctl
    result = run_cmd([
        "udisksctl", "mount", "-b", device, "--no-user-interaction"
    ], check=False)

    if result.returncode == 0:
        match = re.search(r'at (.+?)\.?\s*$', result.stdout)
        mount_point = match.group(1).strip() if match else "/media/unknown"
        return {
            "success": True,
            "mount_point": mount_point,
            "message": f"Karte gemountet: {mount_point}"
        }
    else:
        # Fallback: mount als root versuchen
        mount_point = f"/media/photoflow_{device.replace('/dev/', '')}"
        Path(mount_point).mkdir(parents=True, exist_ok=True)
        result2 = run_cmd(["mount", device, mount_point], check=False)
        if result2.returncode == 0:
            return {
                "success": True,
                "mount_point": mount_point,
                "message": f"Karte gemountet: {mount_point}"
            }
        raise HTTPException(
            status_code=500,
            detail=f"Mount fehlgeschlagen: {result.stderr or result2.stderr}"
        )

@router.post("/unmount")
async def unmount_card(req: MountRequest):
    """Karte sicher auswerfen"""
    device = req.device

    if not is_valid_device(device):
        raise HTTPException(status_code=400, detail=f"Ungültiges Gerät: {device}")

    # Aktuellen Mount-Punkt herausfinden
    mp_result = run_cmd(["lsblk", "-o", "MOUNTPOINT", "-n", device], check=False)
    mount_point = mp_result.stdout.strip()

    # Erst mit udisksctl versuchen
    result = run_cmd([
        "udisksctl", "unmount", "-b", device, "--no-user-interaction"
    ], check=False)

    if result.returncode != 0:
        # Fallback: umount direkt
        if mount_point:
            result = run_cmd(["umount", mount_point], check=False)
        else:
            result = run_cmd(["umount", device], check=False)

    if result.returncode == 0:
        # Power-off für sicheres Entfernen (parent device)
        parent = re.sub(r'[0-9]+$', '', device)
        run_cmd([
            "udisksctl", "power-off", "-b", parent, "--no-user-interaction"
        ], check=False)
        return {
            "success": True,
            "message": "✓ Karte kann sicher entfernt werden"
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Auswerfen fehlgeschlagen: {result.stderr}"
        )

@router.get("/scan/{mount_point:path}")
async def scan_card(mount_point: str):
    """Karte scannen: Fotos und Videos zählen"""
    # mount_point kommt ohne führenden Slash vom Router
    mp = Path(f"/{mount_point}")
    if not mp.exists():
        raise HTTPException(status_code=404, detail=f"Mount-Punkt nicht gefunden: {mp}")

    photo_exts = {'.arw', '.dng', '.jpg', '.jpeg', '.png', '.cr2', '.cr3', '.nef', '.raf'}
    video_exts = {'.mp4', '.mov', '.avi', '.mts', '.m2ts'}

    photos = []
    videos = []

    for f in mp.rglob("*"):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        if ext in photo_exts:
            photos.append(str(f))
        elif ext in video_exts:
            videos.append(str(f))

    total_size = 0
    for f in photos + videos:
        try:
            total_size += Path(f).stat().st_size
        except:
            pass

    return {
        "photo_count": len(photos),
        "video_count": len(videos),
        "photos": photos,
        "videos": videos,
        "total_size": total_size,
        "mount_point": str(mp)
    }

def _parse_size(size_str: str) -> int:
    """Größe wie '32G' in Bytes umrechnen"""
    try:
        units = {"B": 1, "K": 1024, "M": 1024**2, "G": 1024**3, "T": 1024**4}
        size_str = size_str.strip().upper()
        if size_str and size_str[-1] in units:
            return int(float(size_str[:-1]) * units[size_str[-1]])
        return int(size_str)
    except:
        return 0
